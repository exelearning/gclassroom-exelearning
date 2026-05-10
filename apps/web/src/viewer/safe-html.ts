/** Inject the SCORM API bridge into an .elpx index.html document.
 *
 *  We add the bridge as the FIRST script in <head> so eXeLearning's runtime
 *  finds `window.API` / `window.API_1484_11` (and the canonical
 *  `findAPI()` traversal up the window tree) before any content scripts run.
 *
 *  We also append an external-link interception script (mirroring exeviewer)
 *  so anchor clicks targeting external sites open in new tabs rather than
 *  trying to navigate the iframe (which Classroom would block).
 */

const BRIDGE_PLACEHOLDER = '__GCLASSROOM_SESSION_ID__';

const BRIDGE_SCRIPT_SRC = `
(function(){
  try {
    var host = window.parent && window.parent.__gclassroomScormHost;
    if (!host || host.sessionId !== '${BRIDGE_PLACEHOLDER}') return;
    if (host.scorm12)   window.API           = host.scorm12;
    if (host.scorm2004) window.API_1484_11   = host.scorm2004;
  } catch (err) {
    /* cross-origin or host missing — content runs without grading */
    console.warn('[gclassroom-exelearning] SCORM bridge unavailable:', err);
  }
})();
`;

const EXTERNAL_LINKS_SCRIPT = `
(function(){
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    try {
      var u = new URL(a.getAttribute('href'), window.location.href);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== window.location.origin) {
        e.preventDefault();
        e.stopPropagation();
        window.open(u.toString(), '_blank', 'noopener,noreferrer');
      }
    } catch (_) { /* let browser handle */ }
  }, true);
})();
`;

export function injectScormBridge(html: string, sessionId: string): string {
  const head = `<script data-injected-by="gclassroom-exelearning-scorm">${BRIDGE_SCRIPT_SRC.replace(BRIDGE_PLACEHOLDER, sessionId)}</script>`;
  const tail = `<script data-injected-by="gclassroom-exelearning-links">${EXTERNAL_LINKS_SCRIPT}</script>`;

  let out = html;

  // Insert bridge as the first child of <head>. If <head> is missing, prepend.
  const headOpen = /<head\b[^>]*>/i.exec(out);
  if (headOpen) {
    const insertAt = headOpen.index + headOpen[0].length;
    out = out.slice(0, insertAt) + head + out.slice(insertAt);
  } else {
    out = head + out;
  }

  // Append external-link handler before </body> (or end).
  const bodyClose = out.lastIndexOf('</body>');
  if (bodyClose >= 0) {
    out = out.slice(0, bodyClose) + tail + out.slice(bodyClose);
  } else {
    out = out + tail;
  }
  return out;
}
