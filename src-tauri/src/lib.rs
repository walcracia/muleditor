use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{WebviewUrl, WebviewWindowBuilder};

const MAX_FOLDER_FILES: usize = 1000;
const MAX_TEXT_FILE_BYTES: u64 = 5 * 1024 * 1024;

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
