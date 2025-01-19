import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(projectRoot, 'privacy/policy.md');
const extensionTarget = resolve(projectRoot, 'extension/privacy/index.html');
const docsTarget = resolve(projectRoot, 'docs/privacy-policy.html');
const markdown = await readFile(sourcePath, 'utf8');
const body = renderMarkdown(markdown);

await Promise.all([
  writePrivacyPage(extensionTarget, body, '../icons/reqkit-128.png'),
  writePrivacyPage(docsTarget, body, null)
]);

async function writePrivacyPage(target, renderedBody, iconPath) {
  await mkdir(dirname(target), { recursive: true });
  const icon = iconPath
    ? `<img src="${iconPath}" width="64" height="64" alt="ReqKit">`
    : '';
  await writeFile(target, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReqKit Privacy Policy</title>
  <style>${getStyles()}</style>
</head>
<body>
  <main>
    <header>${icon}<div><span class="eyebrow">ReqKit</span><span>Privacy and data use</span></div></header>
    ${renderedBody}
  </main>
</body>
</html>
`, 'utf8');
}

function renderMarkdown(source) {
  const lines = source.trim().split(/\r?\n/);
  const output = [];
  let paragraph = [];
  let listType = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  };

  lines.forEach((line) => {
    const heading = /^(#{1,2})\s+(.+)$/.exec(line);
    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (listItem) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        output.push('<ul>');
        listType = 'ul';
      }
      output.push(`<li>${renderInline(listItem[1])}</li>`);
    } else if (!line.trim()) {
      flushParagraph();
      closeList();
    } else {
      paragraph.push(line.trim());
    }
  });
  flushParagraph();
  closeList();
  return output.join('\n    ');
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getStyles() {
  return `
:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;background:#eff6ff}
*{box-sizing:border-box}body{margin:0;padding:40px 20px;background:linear-gradient(145deg,#eaf3ff,#f8fbff 48%,#eaf2ff)}
main{max-width:760px;margin:0 auto;padding:40px;border:1px solid #bfdbfe;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(30,64,175,.13)}
header{display:flex;align-items:center;gap:16px;padding-bottom:22px;border-bottom:1px solid #dbeafe;color:#64748b;font-size:13px}header img{border-radius:14px}
.eyebrow{display:block;margin-bottom:4px;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
h1{margin:28px 0 4px;font-size:30px;letter-spacing:-.02em}h1+p{margin-top:0;color:#64748b;font-size:13px}h2{margin:30px 0 10px;font-size:18px}
p,li{color:#334155;font-size:15px;line-height:1.65}li+li{margin-top:8px}code{padding:2px 5px;border-radius:5px;background:#eff6ff;color:#1e40af}a{color:#1d4ed8}
@media(max-width:600px){body{padding:0}main{padding:26px 20px;border:0;border-radius:0}}
`;
}
