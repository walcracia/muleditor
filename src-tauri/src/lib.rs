use std::{
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::Engine;
use tauri::{WebviewUrl, WebviewWindowBuilder};

const MAX_FOLDER_FILES: usize = 1000;
const MAX_TEXT_FILE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_MARKDOWN_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedTextFile {
    name: String,
    path: String,
    relative_path: String,
    workspace_root: String,
    content: String,
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|error| format!("Failed to read {path}: {error}"))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|error| format!("Failed to write {path}: {error}"))
}

#[tauri::command]
fn read_markdown_image(source_path: String, image_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.is_absolute() {
        return Err("Markdown source path must be absolute to resolve a local image".to_string());
    }
    let parent = source
        .parent()
        .ok_or_else(|| "Markdown source has no parent folder".to_string())?;
    let raw = image_path.trim().replace('\\', "/");
    let url_path = raw.split(['?', '#']).next().unwrap_or("");
    if url_path.is_empty() || !is_relative_image_path(url_path) {
        return Err("Markdown images must use a relative local path, not a URL or absolute path".to_string());
    }

    let mut supported_type = false;
    // Prefer URL semantics; a literal '#' filename is tried if that path is absent.
    for encoded_path in [url_path, raw.as_str()] {
        let decoded = percent_encoding::percent_decode_str(encoded_path)
            .decode_utf8()
            .map_err(|_| "Markdown image path is not valid UTF-8".to_string())?;
        let decoded = decoded.replace('\\', "/");
        if !is_relative_image_path(&decoded) {
            return Err("Markdown image path must remain relative after URL decoding".to_string());
        }
        let relative = Path::new(&decoded);
        let Some(mime) = markdown_image_mime(relative) else {
            continue;
        };
        supported_type = true;
        let path = parent.join(relative);
        let file = match std::fs::File::open(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(format!("Cannot read Markdown image {}: {error}", path.display())),
        };
        let metadata = file
            .metadata()
            .map_err(|error| format!("Cannot inspect Markdown image {}: {error}", path.display()))?;
        if !metadata.is_file() {
            return Err(format!("Markdown image is not a regular file: {}", path.display()));
        }
        if metadata.len() > MAX_MARKDOWN_IMAGE_BYTES {
            return Err("Markdown image exceeds the 10 MiB limit".to_string());
        }
        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        file.take(MAX_MARKDOWN_IMAGE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Cannot read Markdown image {}: {error}", path.display()))?;
        if bytes.len() as u64 > MAX_MARKDOWN_IMAGE_BYTES {
            return Err("Markdown image exceeds the 10 MiB limit".to_string());
        }
        if !is_markdown_image_content(&bytes, mime) {
            return Err(format!("Unsupported or invalid Markdown image content: {}", path.display()));
        }
        // SVG is returned only for use in an <img> data URI, never as inline DOM.
        return Ok(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ));
    }
    if !supported_type {
        return Err("Unsupported Markdown image type (PNG, JPEG, GIF, WebP, BMP, ICO and SVG are allowed)".to_string());
    }
    Err(format!(
        "Markdown image was not found relative to {}: {image_path}",
        parent.display()
    ))
}

fn is_relative_image_path(path: &str) -> bool {
    !path.starts_with(['/', '\\'])
        && !path.contains(':')
        && !path.contains('\0')
        && !Path::new(path).has_root()
}

fn markdown_image_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

fn is_markdown_image_content(bytes: &[u8], mime: &str) -> bool {
    match mime {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "image/webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        "image/bmp" => bytes.starts_with(b"BM"),
        "image/x-icon" => bytes.starts_with(&[0, 0, 1, 0]),
        "image/svg+xml" => {
            let Ok(text) = std::str::from_utf8(bytes) else {
                return false;
            };
            let mut root = text.trim_start_matches('\u{feff}').trim_start();
            loop {
                let delimiter = if root.starts_with("<?xml") {
                    "?>"
                } else if root.starts_with("<!--") {
                    "-->"
                } else {
                    break;
                };
                let Some(end) = root.find(delimiter) else {
                    return false;
                };
                root = root[end + delimiter.len()..].trim_start();
            }
            root.strip_prefix("<svg")
                .and_then(|tail| tail.chars().next())
                .is_some_and(|character| {
                    character.is_whitespace() || character == '>' || character == '/'
                })
        }
        _ => false,
    }
}

#[tauri::command]
fn read_text_folder(path: String) -> Result<Vec<OpenedTextFile>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("{path} is not a folder"));
    }

    let mut files = Vec::new();
    collect_text_files(&root, &root, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

#[tauri::command]
fn read_startup_files() -> Result<Vec<OpenedTextFile>, String> {
    read_startup_paths(std::env::args_os().skip(1).map(PathBuf::from))
}

#[tauri::command]
fn read_dropped_paths(paths: Vec<String>) -> Result<Vec<OpenedTextFile>, String> {
    read_startup_paths(paths.into_iter().map(PathBuf::from))
}

#[tauri::command]
async fn open_html_preview_window(
    app: tauri::AppHandle,
    title: String,
    content: String,
    source_path: Option<String>,
) -> Result<(), String> {
    let preview_dir = std::env::temp_dir().join("muleditor-html-preview");
    std::fs::create_dir_all(&preview_dir)
        .map_err(|error| format!("Failed to prepare HTML preview folder: {error}"))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to read system time: {error}"))?
        .as_nanos();
    let preview_name = safe_preview_file_name(&title);
    let preview_path = preview_dir.join(format!("{preview_name}-{timestamp}.html"));
    let preview_content = html_preview_content(&content, source_path.as_deref());

    std::fs::write(&preview_path, preview_content)
        .map_err(|error| format!("Failed to write HTML preview: {error}"))?;

    let preview_url = url::Url::from_file_path(&preview_path).map_err(|_| {
        format!(
            "Failed to create preview URL for {}",
            preview_path.display()
        )
    })?;
    let label = format!("html-preview-{timestamp}");

    WebviewWindowBuilder::new(&app, label, WebviewUrl::CustomProtocol(preview_url))
        .title(format!("哞-编辑器 Preview - {title}"))
        .inner_size(1100.0, 760.0)
        .resizable(true)
        .center()
        .build()
        .map_err(|error| format!("Failed to open HTML preview window: {error}"))?;

    Ok(())
}

fn read_startup_paths<I>(paths: I) -> Result<Vec<OpenedTextFile>, String>
where
    I: IntoIterator<Item = PathBuf>,
{
    let mut files = Vec::new();

    for path in paths {
        if files.len() >= MAX_FOLDER_FILES || !path.exists() {
            continue;
        }

        let metadata = std::fs::metadata(&path)
            .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;

        if metadata.is_dir() {
            collect_text_files(&path, &path, &mut files)?;
            continue;
        }

        if !metadata.is_file()
            || metadata.len() > MAX_TEXT_FILE_BYTES
            || !is_supported_document(&path)
        {
            continue;
        }

        let workspace_root = path.parent().unwrap_or_else(|| Path::new(""));
        files.push(read_opened_text_file(&path, workspace_root)?);
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

fn collect_text_files(
    root: &Path,
    current: &Path,
    files: &mut Vec<OpenedTextFile>,
) -> Result<(), String> {
    if files.len() >= MAX_FOLDER_FILES {
        return Ok(());
    }

    let entries = std::fs::read_dir(current)
        .map_err(|error| format!("Failed to read folder {}: {error}", current.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to inspect folder entry: {error}"))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;

        if metadata.is_dir() {
            collect_text_files(root, &path, files)?;
            continue;
        }

        if !metadata.is_file()
            || metadata.len() > MAX_TEXT_FILE_BYTES
            || !is_supported_document(&path)
        {
            continue;
        }

        files.push(read_opened_text_file(&path, root)?);

        if files.len() >= MAX_FOLDER_FILES {
            break;
        }
    }

    Ok(())
}

fn read_opened_text_file(path: &Path, workspace_root: &Path) -> Result<OpenedTextFile, String> {
    let bytes = std::fs::read(path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let content = String::from_utf8_lossy(&bytes).to_string();
    let relative_path = path
        .strip_prefix(workspace_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");

    Ok(OpenedTextFile {
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "untitled.txt".to_string()),
        path: path.to_string_lossy().to_string(),
        relative_path,
        workspace_root: workspace_root.to_string_lossy().to_string(),
        content,
    })
}

fn is_supported_document(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    matches!(
        path.extension()
            .map(|extension| extension.to_string_lossy().to_ascii_lowercase())
            .as_deref(),
        Some("md")
            | Some("markdown")
            | Some("html")
            | Some("htm")
            | Some("xml")
            | Some("xsd")
            | Some("dtd")
            | Some("yaml")
            | Some("yml")
            | Some("json")
            | Some("spdx")
    ) || name.ends_with(".spdx.json")
        || name.ends_with(".spdx.yaml")
        || name.ends_with(".spdx.yml")
}

fn safe_preview_file_name(title: &str) -> String {
    let mut name = title
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if name.is_empty() {
        name = "untitled".to_string();
    }

    name.chars().take(80).collect()
}

fn html_preview_content(content: &str, source_path: Option<&str>) -> String {
    let Some(base_href) = source_path.and_then(base_href_for_source_path) else {
        return content.to_string();
    };

    let lower = content.to_ascii_lowercase();
    if lower.contains("<base ") {
        return content.to_string();
    }

    let base_tag = format!(r#"<base href="{}">"#, escape_html_attribute(&base_href));
    if let Some(head_start) = lower.find("<head") {
        if let Some(head_end) = lower[head_start..].find('>') {
            let insert_at = head_start + head_end + 1;
            let mut next = String::with_capacity(content.len() + base_tag.len() + 1);
            next.push_str(&content[..insert_at]);
            next.push('\n');
            next.push_str(&base_tag);
            next.push_str(&content[insert_at..]);
            return next;
        }
    }

    format!("{base_tag}\n{content}")
}

fn base_href_for_source_path(source_path: &str) -> Option<String> {
    let parent = Path::new(source_path).parent()?;
    url::Url::from_directory_path(parent)
        .ok()
        .map(|url| url.to_string())
}

fn escape_html_attribute(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            read_markdown_image,
            read_text_folder,
            read_startup_files,
            read_dropped_paths,
            open_html_preview_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running 哞-编辑器");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn markdown_image_test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "muleditor-image-{name}-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).expect("system time").as_nanos()
        ));
        std::fs::create_dir_all(&root).expect("create image test root");
        root
    }

    #[test]
    fn markdown_image_reads_encoded_chinese_relative_path() {
        let root = markdown_image_test_root("unicode");
        let images = root.join("images");
        std::fs::create_dir_all(&images).expect("create image folder");
        let bytes = b"\x89PNG\r\n\x1a\nexample";
        std::fs::write(images.join("图 1#.png"), bytes).expect("write image");
        let source = root.join("readme.md").to_string_lossy().to_string();
        let uri = read_markdown_image(source.clone(), "images/%E5%9B%BE%201%23.png?next=https://example.com#preview".to_string()).expect("read encoded image");
        assert_eq!(uri, format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)));
        assert_eq!(uri, read_markdown_image(source, "images/图 1#.png".to_string()).expect("read literal hash image"));
        std::fs::remove_dir_all(root).expect("remove image test root");
    }

    #[test]
    fn markdown_image_reads_parent_directory_image() {
        let root = markdown_image_test_root("parent");
        let docs = root.join("docs");
        std::fs::create_dir_all(&docs).expect("create docs");
        std::fs::write(root.join("logo.gif"), b"GIF89aimage").expect("write image");
        let uri = read_markdown_image(docs.join("readme.md").to_string_lossy().to_string(), "../logo.gif".to_string()).expect("read parent image");
        assert!(uri.starts_with("data:image/gif;base64,"));
        std::fs::remove_dir_all(root).expect("remove image test root");
    }

    #[test]
    fn markdown_image_rejects_non_images_protocols_and_missing_files() {
        let root = markdown_image_test_root("rejection");
        let source = root.join("readme.md").to_string_lossy().to_string();
        std::fs::write(root.join("private.txt"), "private contents").expect("write text");
        std::fs::write(root.join("fake.png"), "private contents").expect("write renamed text");
        assert!(read_markdown_image(source.clone(), "private.txt".to_string()).unwrap_err().contains("Unsupported Markdown image type"));
        assert!(read_markdown_image(source.clone(), "fake.png".to_string()).unwrap_err().contains("invalid Markdown image content"));
        assert!(read_markdown_image(source.clone(), "missing.png".to_string()).unwrap_err().contains("was not found"));
        for path in ["https://example.com/a.png", "file:///a.png", "//server/a.png", "/a.png", "%2Fa.png", "%5Ca.png", "%5C%5Cserver/a.png"] {
            assert!(read_markdown_image(source.clone(), path.to_string()).is_err(), "must reject {path}");
        }
        std::fs::remove_dir_all(root).expect("remove image test root");
    }

    #[test]
    fn markdown_image_rejects_oversized_files_before_loading() {
        let root = markdown_image_test_root("size");
        let file = std::fs::File::create(root.join("large.png")).expect("create large image");
        file.set_len(MAX_MARKDOWN_IMAGE_BYTES + 1).expect("set file size");
        drop(file);
        let error = read_markdown_image(root.join("readme.md").to_string_lossy().to_string(), "large.png".to_string()).unwrap_err();
        assert!(error.contains("10 MiB"));
        std::fs::remove_dir_all(root).expect("remove image test root");
    }

    #[test]
    fn markdown_svg_stays_an_image_data_uri_and_requires_svg_root() {
        let root = markdown_image_test_root("svg");
        let source = root.join("readme.md").to_string_lossy().to_string();
        std::fs::write(root.join("logo.svg"), "<?xml version=\"1.0\"?><!-- logo --><svg xmlns=\"http://www.w3.org/2000/svg\"></svg>").expect("write svg");
        std::fs::write(root.join("fake.svg"), "<html><svg></svg></html>").expect("write fake svg");
        assert!(read_markdown_image(source.clone(), "logo.svg".to_string()).expect("read svg").starts_with("data:image/svg+xml;base64,"));
        assert!(read_markdown_image(source, "fake.svg".to_string()).is_err());
        std::fs::remove_dir_all(root).expect("remove image test root");
    }

    #[test]
    fn read_text_folder_recurses_supported_documents() {
        let root = std::env::temp_dir().join(format!(
            "muleditor-folder-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let config_dir = root.join("config");
        let schema_dir = root.join("schema");
        std::fs::create_dir_all(&config_dir).expect("create config dir");
        std::fs::create_dir_all(&schema_dir).expect("create schema dir");
        std::fs::write(
            config_dir.join("app.yaml"),
            "schemaRef: ../schema/profile.json#/limits\n",
        )
        .expect("write yaml");
        std::fs::write(
            schema_dir.join("profile.json"),
            "{\"limits\":{\"maxOpenTabs\":4}}\n",
        )
        .expect("write json");
        std::fs::write(root.join("ignored.bin"), [0_u8, 1, 2, 3]).expect("write ignored file");

        let files = read_text_folder(root.to_string_lossy().to_string()).expect("read folder");
        let relative_paths: Vec<_> = files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();

        assert_eq!(
            relative_paths,
            vec!["config/app.yaml", "schema/profile.json"]
        );
        assert!(files
            .iter()
            .all(|file| file.workspace_root == root.to_string_lossy()));
        assert!(files[0].content.contains("schemaRef"));

        std::fs::remove_dir_all(root).expect("remove temp folder");
    }

    #[test]
    fn read_startup_paths_opens_supported_file_argument() {
        let root = std::env::temp_dir().join(format!(
            "muleditor-startup-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).expect("create temp dir");
        let file_path = root.join("opened-from-windows.md");
        std::fs::write(&file_path, "# Opened from Windows\n").expect("write markdown");

        let files = read_startup_paths([file_path.clone()]).expect("read startup paths");

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "opened-from-windows.md");
        assert_eq!(files[0].path, file_path.to_string_lossy());
        assert_eq!(files[0].relative_path, "opened-from-windows.md");
        assert_eq!(files[0].workspace_root, root.to_string_lossy());
        assert!(files[0].content.contains("Opened from Windows"));

        std::fs::remove_dir_all(root).expect("remove temp dir");
    }

    #[test]
    fn read_dropped_paths_opens_folder_and_ignores_unsupported_files() {
        let root = std::env::temp_dir().join(format!(
            "muleditor-drop-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let nested = root.join("nested");
        std::fs::create_dir_all(&nested).expect("create nested dir");
        std::fs::write(root.join("profile.json"), "{\"name\":\"drop\"}\n").expect("write json");
        std::fs::write(nested.join("pipeline.yaml"), "ref: ../profile.json#/name\n")
            .expect("write yaml");
        std::fs::write(root.join("ignored.exe"), [0_u8, 1, 2]).expect("write ignored");

        let files = read_dropped_paths(vec![root.to_string_lossy().to_string()])
            .expect("read dropped folder");
        let relative_paths: Vec<_> = files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect();

        assert_eq!(relative_paths, vec!["nested/pipeline.yaml", "profile.json"]);
        assert!(files
            .iter()
            .all(|file| file.workspace_root == root.to_string_lossy()));

        std::fs::remove_dir_all(root).expect("remove temp dir");
    }

    #[test]
    fn html_preview_content_injects_base_href() {
        let root = std::env::temp_dir().join("muleditor-preview-base-test");
        let source_path = root.join("pages").join("index.html");
        let source = source_path.to_string_lossy().to_string();
        let content = "<!doctype html><html><head><title>Test</title></head><body></body></html>";
        let preview = html_preview_content(content, Some(&source));

        assert!(preview.contains("<base href=\"file://"));
        assert!(preview.contains("/pages/"));
        assert!(preview.contains("<head>\n<base"));
    }
}
