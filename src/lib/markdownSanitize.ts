import createDOMPurify from "dompurify";

const forbiddenTags = ["script", "iframe", "object", "embed", "link", "meta", "base", "form", "button", "textarea", "select", "video", "audio", "source", "animate", "animatemotion", "animatetransform", "set"];

/** A separate purifier per call avoids hooks leaking across concurrent preview/export renders. */
export function sanitizeMarkdownRoot(root: HTMLElement, trusted?: WeakSet<Node>): void {
  const purifier = createDOMPurify(window);
  purifier.addHook("uponSanitizeElement", (node) => {
    if (node.nodeName.toLowerCase() === "style" && !trusted?.has(node)) node.parentNode?.removeChild(node);
  });
  purifier.addHook("uponSanitizeAttribute", (node, data) => {
    if (data.attrName === "style" && !trusted?.has(node)) data.keepAttr = false;
    if (node.nodeName.toLowerCase() === "input" && data.attrName === "type" && data.attrValue !== "checkbox") data.keepAttr = false;
    if (data.attrName === "src" && node.nodeName.toLowerCase() === "img" && /^blob:/i.test(data.attrValue)) data.forceKeepAttr = true;
  });
  purifier.sanitize(root, {
    IN_PLACE: true,
    USE_PROFILES: trusted ? { html: true, svg: true, svgFilters: true, mathMl: true } : { html: true },
    ADD_TAGS: trusted ? ["foreignObject"] : [],
    HTML_INTEGRATION_POINTS: { foreignobject: true, "annotation-xml": true },
    FORBID_TAGS: forbiddenTags,
    FORBID_ATTR: ["srcdoc", "autofocus", "formaction", "srcset"],
    SANITIZE_DOM: true
  });
  root.querySelectorAll("input").forEach((input) => {
    if (input.type !== "checkbox") input.remove();
    else input.disabled = true;
  });
}

export function trustGeneratedTree(root: Node, trusted: WeakSet<Node>) {
  trusted.add(root);
  for (const child of root.childNodes) trustGeneratedTree(child, trusted);
}

/** Mermaid emits scoped CSS and HTML labels inside SVG; retain both without accepting arbitrary CSS. */
export function sanitizeMermaidSvg(svg: string): string {
  const root = document.createElement("div");
  root.innerHTML = svg;
  const diagram = root.querySelector("svg");
  if (!diagram) throw new Error("Mermaid did not produce an SVG diagram");
  const id = diagram.getAttribute("id") ?? "";
  for (const style of root.querySelectorAll("style")) {
    style.textContent = Array.from((style.textContent ?? "").matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => {
      const selector = match[1].trim();
      if (!id || /[@\\+~]/.test(selector) || selector.split(",").some((part) => {
        const scoped = part.trim();
        return !scoped.startsWith(`#${id}`) || (scoped.length > id.length + 1 && !/[\s>.:\[]/.test(scoped[id.length + 1]));
      })) return "";
      const declarations = safeDiagramCss(match[2]);
      return declarations ? `${selector}{${declarations}}` : "";
    }).join("\n");
  }
  for (const node of root.querySelectorAll<HTMLElement>("[style]")) {
    const css = safeDiagramCss(node.getAttribute("style") ?? "");
    if (css) node.setAttribute("style", css);
    else node.removeAttribute("style");
  }
  for (const image of root.querySelectorAll("image,use,feImage")) {
    for (const attribute of ["href", "xlink:href"]) {
      const value = image.getAttribute(attribute);
      if (value && !/^(?:#|data:image\/)/i.test(value)) image.removeAttribute(attribute);
    }
  }
  const trusted = new WeakSet<Node>();
  trustGeneratedTree(diagram, trusted);
  sanitizeMarkdownRoot(root, trusted);
  return root.innerHTML;
}

function safeDiagramCss(css: string): string {
  const declaration = document.createElement("span").style;
  declaration.cssText = css;
  const allowed = /^(?:fill(?:-opacity|-rule)?|stroke(?:-width|-dasharray|-dashoffset|-linecap|-linejoin|-opacity)?|color|background-color|opacity|font(?:-family|-size|-weight|-style|-variant)?|text-(?:align|decoration|anchor|transform)|dominant-baseline|alignment-baseline|vertical-align|white-space|word-(?:break|wrap)|overflow(?:-wrap)?|line-height|display|visibility|width|height|max-width|max-height|min-width|min-height|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|border(?:-(?:color|style|width|radius))?|box-sizing|transform(?:-origin)?)$/;
  return Array.from({ length: declaration.length }, (_, index) => declaration.item(index)).filter((property) => allowed.test(property)).flatMap((property) => {
    const value = declaration.getPropertyValue(property);
    if (/[\\<>@]|expression\s*\(|javascript\s*:|vbscript\s*:/i.test(value)) return [];
    if (/url\s*\(/i.test(value) && !/^url\(\s*["']?#[\w-]+["']?\s*\)$/i.test(value)) return [];
    return `${property}:${value};`;
  }).join("");
}
