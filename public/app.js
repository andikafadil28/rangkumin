const statusText = document.querySelector("[data-health-status]");
const statusDot = document.querySelector("[data-health-dot]");

async function checkHealth() {
  try {
    const response = await fetch("/api/health", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Health check gagal dengan status ${response.status}`);
    }

    statusText.textContent = "Worker siap digunakan";
    statusDot.dataset.state = "online";
  } catch {
    statusText.textContent = "Worker belum tersedia";
    statusDot.dataset.state = "offline";
  }
}

void checkHealth();
