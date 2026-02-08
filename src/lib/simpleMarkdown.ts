/**
 * Simple Markdown to HTML converter
 *
 * Handles common patterns used by AI responses:
 * - **bold** → <strong>
 * - *italic* → <em>
 * - ## headers → <h3>
 * - ### headers → <h4>
 * - - bullet points → <ul><li>
 * - numbered lists → <ol><li>
 * - --- horizontal rules → <hr>
 * - | tables | → <table>
 * - line breaks → proper paragraphs
 *
 * This is NOT a full markdown parser - just enough for readable AI responses.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseTableRows(lines: string[], startIndex: number): { html: string; endIndex: number } {
  const rows: string[][] = [];
  let i = startIndex;
  let hasHeader = false;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line.startsWith('|') || !line.endsWith('|')) break;

    // Check if this is a separator row (|---|---|)
    if (line.match(/^\|[\s-:]+\|$/)) {
      hasHeader = rows.length > 0;
      i++;
      continue;
    }

    // Parse cells
    const cells = line.slice(1, -1).split('|').map(c => c.trim());
    rows.push(cells);
    i++;
  }

  if (rows.length === 0) return { html: '', endIndex: startIndex };

  let html = '<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;">';

  rows.forEach((row, idx) => {
    const isHeaderRow = hasHeader && idx === 0;
    const tag = isHeaderRow ? 'th' : 'td';
    const style = isHeaderRow
      ? 'style="background:#f1f5f9;padding:8px 12px;text-align:left;font-weight:600;border:1px solid #e2e8f0;"'
      : 'style="padding:8px 12px;border:1px solid #e2e8f0;"';

    html += '<tr>';
    row.forEach(cell => {
      html += `<${tag} ${style}>${cell}</${tag}>`;
    });
    html += '</tr>';
  });

  html += '</table>';
  return { html, endIndex: i };
}

export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  let html = escapeHtml(markdown);

  // Headers (## and ###)
  html = html.replace(/^### (.+)$/gm, '<h4 style="font-size:14px;font-weight:700;margin:16px 0 8px 0;color:#1e293b;">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="font-size:16px;font-weight:700;margin:20px 0 10px 0;color:#0f172a;">$1</h3>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Process lines for bullets, tables, and paragraphs
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Horizontal rule
    if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/) || line.match(/^_{3,}$/)) {
      if (inList) {
        processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      processedLines.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">');
      i++;
      continue;
    }

    // Table
    if (line.startsWith('|') && line.endsWith('|')) {
      if (inList) {
        processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      const { html: tableHtml, endIndex } = parseTableRows(lines, i);
      if (tableHtml) {
        processedLines.push(tableHtml);
        i = endIndex;
        continue;
      }
    }

    // Bullet point
    if (line.match(/^[-•] /)) {
      if (!inList || listType !== 'ul') {
        if (inList) processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        processedLines.push('<ul style="margin:10px 0;padding-left:20px;">');
        inList = true;
        listType = 'ul';
      }
      processedLines.push(`<li style="margin:6px 0;line-height:1.6;">${line.replace(/^[-•] /, '')}</li>`);
      i++;
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\. /)) {
      if (!inList || listType !== 'ol') {
        if (inList) processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        processedLines.push('<ol style="margin:10px 0;padding-left:20px;">');
        inList = true;
        listType = 'ol';
      }
      processedLines.push(`<li style="margin:6px 0;line-height:1.6;">${line.replace(/^\d+\. /, '')}</li>`);
      i++;
      continue;
    }

    // Headers (already processed, just pass through)
    if (line.startsWith('<h3') || line.startsWith('<h4')) {
      if (inList) {
        processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      processedLines.push(line);
      i++;
      continue;
    }

    // Empty line
    if (line === '') {
      if (inList) {
        processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
        inList = false;
        listType = null;
      }
      i++;
      continue;
    }

    // Regular text
    if (inList) {
      processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
      inList = false;
      listType = null;
    }
    processedLines.push(`<p style="margin:8px 0;line-height:1.7;">${line}</p>`);
    i++;
  }

  // Close any open list
  if (inList) {
    processedLines.push(listType === 'ol' ? '</ol>' : '</ul>');
  }

  return processedLines.join('');
}

/**
 * For React components - returns sanitized HTML that can be used with dangerouslySetInnerHTML
 * The output only contains safe tags we generate ourselves.
 */
export function markdownToReactHtml(markdown: string): { __html: string } {
  return { __html: markdownToHtml(markdown) };
}
