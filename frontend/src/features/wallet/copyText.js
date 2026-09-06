export async function copyText(text, options = {}) {
  const value = String(text ?? "").trim();
  if (!value) throw new Error("COPY_VALUE_REQUIRED");

  const clipboard = Object.hasOwn(options, "clipboard")
    ? options.clipboard
    : globalThis.navigator?.clipboard;
  if (typeof clipboard?.writeText === "function") {
    try {
      await clipboard.writeText(value);
      return;
    } catch {
      // Continue to the browser fallback when Clipboard API access is denied.
    }
  }

  const documentImpl = Object.hasOwn(options, "documentImpl")
    ? options.documentImpl
    : globalThis.document;
  if (
    !documentImpl?.body ||
    typeof documentImpl.createElement !== "function" ||
    typeof documentImpl.execCommand !== "function"
  ) {
    throw new Error("COPY_UNAVAILABLE");
  }

  const textarea = documentImpl.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  documentImpl.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    if (!documentImpl.execCommand("copy")) throw new Error("COPY_FAILED");
  } finally {
    textarea.remove();
  }
}
