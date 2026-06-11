document.addEventListener("DOMContentLoaded", () => {
    /*FOOTER YEAR*/
    const year = document.getElementById("y");
    if (year) {
        year.textContent = new Date().getFullYear();
    }
    /*ACTIVE NAVIGATION*/
    let current = window.location.pathname.split("/").pop();
    if (current === "") {
        current = "index.html";
    }
    document.querySelectorAll(".link").forEach(link => {
        const href = link.getAttribute("href");
        if (href === current) {
            link.classList.add("active");
        }
    });
});
