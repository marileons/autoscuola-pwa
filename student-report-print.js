"use strict";

(function initStudentReportPrint(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StudentReportPrint = api;
})(typeof window !== "undefined" ? window : globalThis, function createStudentReportPrint() {
  function installReportControls(win, doc, schedule) {
    if (doc.__agendaStudentReportPrint) return doc.__agendaStudentReportPrint;
    if (doc.documentElement?.dataset.printControls === "ready") return;
    const printButton = doc.getElementById("studentReportPrint");
    const closeButton = doc.getElementById("studentReportClose");
    const status = doc.getElementById("studentReportPrintStatus");
    const alternatives = doc.getElementById("studentReportPrintAlternatives");
    const openLink = doc.getElementById("studentReportOpenAgain");
    const downloadLink = doc.getElementById("studentReportDownloadHtml");
    const later = typeof schedule === "function" ? schedule : win.setTimeout.bind(win);
    let printing = false;
    const cooldownMs = 1200;
    const clock = () => win.performance?.now ? win.performance.now() : Date.now();
    let blockedUntil = -Infinity, printCycle = 0;
    function gestureTime(event) {
      const stamp = Number(event?.timeStamp);
      if (!Number.isFinite(stamp) || stamp <= 0) return clock();
      // Safari versions using epoch timestamps must share the monotonic clock.
      if (stamp > 1e12 && win.performance?.now) return stamp - (win.performance.timeOrigin || (Date.now() - clock()));
      return stamp;
    }
    let ownUrl = "";
    // A loaded report owns its printable copy even if the Agenda tab is closed.
    try { if (win.URL?.createObjectURL && win.Blob && doc.documentElement) {
      const printable = doc.documentElement.cloneNode(true);
      printable.removeAttribute("data-print-controls");
      ownUrl = win.URL.createObjectURL(new win.Blob(["<!doctype html>" + printable.outerHTML], { type: "text/html;charset=utf-8" }));
      win.addEventListener("pagehide", event => { if (!event.persisted && ownUrl) { win.URL.revokeObjectURL(ownUrl); ownUrl = ""; } });
    } } catch { ownUrl = ""; }

    function setStatus(message, isError) {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("error", Boolean(isError));
    }
    function showAlternatives() {
      if (alternatives) alternatives.hidden = false;
      const currentUrl = ownUrl || String(win.location && win.location.href || "");
      if (openLink) openLink.href = currentUrl;
      if (downloadLink) downloadLink.href = currentUrl;
    }
    function releasePrintButton(cycle = printCycle) {
      if (cycle !== printCycle) return;
      const remaining = blockedUntil - clock();
      if (remaining > 0) { later(() => releasePrintButton(cycle), remaining); return; }
      printing = false;
      if (printButton) printButton.disabled = false;
    }
    if (printButton) printButton.addEventListener("click", function onPrintClick(event) {
      if (printing || clock() < blockedUntil || gestureTime(event) < blockedUntil) return;
      printing = true;
      const cycle = ++printCycle;
      printButton.disabled = true;
      setStatus("Apertura del pannello di stampa…", false);
      try {
        // Sincrono nel gesto dell'utente per Safari/PWA e Chrome Android.
        win.print();
        setStatus("Se il pannello non compare, usa APRI REPORT o SCARICA REPORT STAMPABILE.", false);
        showAlternatives();
      } catch (error) {
        setStatus("Impossibile aprire la stampa. Usa uno dei comandi alternativi qui sotto.", true);
        showAlternatives();
      } finally {
        // Start at return from the native dialog, including exceptions. The
        // timestamp fence also rejects old queued events after the timer fires.
        blockedUntil = clock() + cooldownMs;
        later(() => releasePrintButton(cycle), cooldownMs);
      }
    });
    if (closeButton) closeButton.addEventListener("click", function onCloseClick() {
      try {
        win.close();
      } catch (error) {
        setStatus("Chiudi questa scheda usando il comando del browser.", true);
      }
    });
    // The cooldown also covers browsers emitting afterprint synchronously.
    showAlternatives();
    if (doc.documentElement) doc.documentElement.dataset.printControls = "ready";
    doc.__agendaStudentReportPrint = { showAlternatives, releasePrintButton };
    return doc.__agendaStudentReportPrint;
  }
  function documentScript() {
    return `(${installReportControls.toString()})(window,document);`;
  }
  function prepareExaminerDocument(html) {
    const controls='<nav class="report-controls"><button id="studentReportPrint" type="button">STAMPA / SALVA PDF</button><button id="studentReportClose" type="button">TORNA ALL’APP</button><p id="studentReportPrintStatus" role="status"></p><div id="studentReportPrintAlternatives"><a id="studentReportOpenAgain" target="_blank" rel="noopener">APRI REPORT</a> <a id="studentReportDownloadHtml" download="report-esaminatore.html">SCARICA REPORT STAMPABILE</a></div></nav>';
    return html.replace('<button onclick="window.print()">STAMPA / SALVA PDF</button>',controls)
      .replace('</head>',`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{overflow-wrap:anywhere}.report-controls{display:flex;flex-wrap:wrap;gap:10px}.report-controls button,.report-controls a{min-height:44px}.report-controls p,.report-controls div{flex-basis:100%}@media print{.report-controls{display:none!important}}</style></head>`)
      .replace('</body>',`<script>${documentScript()}</script></body>`);
  }
  return { installReportControls, documentScript, prepareExaminerDocument };
});
