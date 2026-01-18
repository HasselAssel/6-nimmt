/* ---------- RENDERING FUNCTIONS ---------- */
function renderGame(state) {
    renderPlayers(state);
    renderStacks(state.stacks);
    renderSelf(state.self);
    renderOthers(state.others);
}

/* ---------- Players ---------- */
function renderPlayers(state) {
    const el = document.getElementById("players-indicator");
    el.innerHTML = "";

    state.players.forEach(p => {
        const dot = document.createElement("div");
        dot.className = "player-dot";

        if (p === state.self_conn) dot.classList.add("self");
        if (p === state.waiting_for_stack) dot.classList.add("waiting");

        el.appendChild(dot);
    });
}

/* ---------- Stacks ---------- */
function renderStacks(stacks) {
    const el = document.getElementById("stacks");
    el.innerHTML = "";

    stacks.forEach((row, rowIndex) => {
        const rowEl = document.createElement("div");
        rowEl.className = "stack";

        row.forEach(card => {
            const cardEl = createCard(card);
            rowEl.appendChild(cardEl);
        });

        // Make stack clickable if the server expects a stack choice
        rowEl.onclick = () => {
            if (waitingForStack) {
                ws.send(JSON.stringify({
                    type: "choose_stack",
                    token: token,
                    index: rowIndex
                }));
                waitingForStack = false; // prevent double-click
            }
        };

        el.appendChild(rowEl);
    });
}

function sumCardPoints(cards) {
    return cards.reduce((sum, c) => sum + c.value, 0);
}

/* ---------- Self ---------- */
function renderSelf(self) {
    const handEl = document.getElementById("hand");
    const playedEl = document.getElementById("played-card");
    const pointsEl = document.getElementById("self-points");

    handEl.innerHTML = "";
    playedEl.innerHTML = "";

    const total = self.points + sumCardPoints(self.card_points);
    pointsEl.textContent = `You (${self.name}): ${total} pts`;

    self.hand.forEach((card, index) => {
        const cardEl = createCard(card);
        cardEl.onclick = () => {
            if (!self.played_card && !waitingForStack) {
                ws.send(JSON.stringify({
                    type: "play_card",
                    token,
                    index
                }));
            }
        };
        handEl.appendChild(cardEl);
    });

    if (self.played_card) {
        const c = createCard(self.played_card);
        c.classList.add("played");
        playedEl.appendChild(c);
    }
}

/* ---------- Others ---------- */
function renderOthers(others) {
    const container = document.getElementById("others-played");
    container.innerHTML = "";

    Object.entries(others).forEach(([player, data]) => {
        const wrapper = document.createElement("div");
        wrapper.className = "played-wrapper";

        const total = data.points + sumCardPoints(data.card_points);

        const label = document.createElement("div");
        label.className = "played-label";
        label.textContent = `${data.name} (${total} pts)`;
        wrapper.appendChild(label);

        if (data.played_card) {
            const card = createCard(data.played_card);
            card.classList.add("played");
            wrapper.appendChild(card);
        }

        container.appendChild(wrapper);
    });
}

/* ---------- Card ---------- */
function createCard(card) {
    const el = document.createElement("div");
    el.className = "card";

    el.innerHTML = `
        <div class="face">${card.face}</div>
        <div class="value">${card.value}</div>
    `;
    return el;
}

/* ---------- WEBSOCKET & SESSION ---------- */
const token = sessionStorage.getItem("token");
const addr  = sessionStorage.getItem("ws_addr");

if (!token || !addr) {
    alert("No saved session found, please login first.");
    window.location.href = "connect.html";
}

let waitingForStack = false;

const ws = new WebSocket(`ws://${addr}/ws`);

ws.onopen = () => {
    console.log("Connected to server, sending reconnect request…");
    ws.send(JSON.stringify({
        type: "reconnect",
        token: token
    }));
};

ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } 
    catch { console.error("Invalid message:", e.data); return; }

    if (msg.type === "gamestate") {
        waitingForStack = !!msg.state.waiting_for_stack;
        renderGame(msg.state);
    }

    if (msg.type === "reconnect_ok") {
        waitingForStack = !!msg.state.waiting_for_stack;
        renderGame(msg.state);
    }
};

ws.onerror = (e) => console.error("WebSocket error:", e);
ws.onclose = () => console.log("Connection closed by server.");
