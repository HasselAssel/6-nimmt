const connectBtn = document.getElementById("connectBtn");
const startBtn = document.getElementById("startBtn");
const status = document.getElementById("status");

document.getElementById("addr").value = location.host;

function setStatus(text, cls) {
    status.textContent = text;
    status.className = `status ${cls}`;
}

let ws = null;

connectBtn.onclick = () => {
    const addr = document.getElementById("addr").value.trim();
    const name = document.getElementById("name").value.trim();

    if (!addr) {
        setStatus("Missing addr", "error");
        return;
    }

    const url = `ws://${addr}/ws`;
    setStatus("Connecting…", "connecting");

    try {
        ws = new WebSocket(url);
    } catch {
        setStatus("Invalid address", "error");
        return;
    }

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: "login" , name: name}));
    };

    ws.onmessage = (e) => {
        let msg;
        try {
            msg = JSON.parse(e.data);
        } catch {
            setStatus("Invalid response", "error");
            return;
        }

        if (msg.type === "login_ok" && msg.success) {
            sessionStorage.setItem("token", msg.token);
            sessionStorage.setItem("ws_addr", addr);

            setStatus("Connected", "ok");
            startBtn.classList.remove("hidden");
        }

        // server confirms game start
        if (msg.type === "start_game") {
            window.location.href = "game.html";
        }
    };

    ws.onerror = () => setStatus("Connection failed", "error");
    ws.onclose = () => {
        setStatus("Connection closed", "error");
        startBtn.classList.add("hidden");
    };
};

// click → request game start
startBtn.onclick = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
        type: "start_game",
        token: sessionStorage.getItem("token")
    }));

    setStatus("Waiting for server…", "connecting");
};
