"use strict";

(function initStudentReportPrint(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.StudentReportPrint = api;
})(typeof window !== "undefined" ? window : globalThis, function createStudentReportPrint() {
  function installReportControls(win, doc, schedule) {
    if (doc.documentElement?.dataset.printControls === "ready") return;
    const printButton = doc.getElementById("studentReportPrint");
    const closeButton = doc.getElementById("studentReportClose");
    const status = doc.getElementById("studentReportPrintStatus");
    const alternatives = doc.getElementById("studentReportPrintAlternatives");
    const openLink = doc.getElementById("studentReportOpenAgain");
    const downloadLink = doc.getElementById("studentReportDownloadHtml");
    const later = typeof schedule === "function" ? schedule : win.setTimeout.bind(win);
    let printing = false;
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
    function releasePrintButton() {
      printing = false;
      if (printButton) printButton.disabled = false;
    }
    if (printButton) printButton.addEventListener("click", function onPrintClick() {
      if (printing) return;
      printing = true;
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
        later(releasePrintButton, 800);
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
    return { showAlternatives, releasePrintButton };
  }
  function documentScript() {
    return `(${installReportControls.toString()})(window,document);`;
  }
  return { installReportControls, documentScript };
});
