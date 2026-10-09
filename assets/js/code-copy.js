document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".highlight").forEach(function (block) {
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.setAttribute("aria-label", "Copy code");
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

    block.style.position = "relative";
    block.appendChild(btn);

    btn.addEventListener("click", function () {
      const code = block.querySelector("code");
      navigator.clipboard.writeText(code ? code.innerText : "").then(function () {
        btn.classList.add("copied");
        btn.setAttribute("aria-label", "Copied!");
        setTimeout(function () {
          btn.classList.remove("copied");
          btn.setAttribute("aria-label", "Copy code");
        }, 2000);
      });
    });
  });
});
