/* ---------- RENDERING FUNCTIONS ---------- */
function renderGame(state) {
    renderPlayers(state);
    renderStacks(state.stacks);
    renderSelf(state.self, state.self_conn);
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
function renderSelf(self, self_conn) {
    const handEl = document.getElementById("hand");
    const playedEl = document.getElementById("played-card");
    const pointsEl = document.getElementById("self-points");

    playedEl.dataset.playerId = self_conn;

    handEl.innerHTML = "";
    playedEl.innerHTML = "";

    const total = self.points + sumCardPoints(self.card_points);
    pointsEl.textContent = `You (${self.name}): ${total} pts`;

    self.hand
     		.map((card, originalIndex) => ({card, originalIndex}))
    		.sort((a, b) => a.card.face - b.card.face)
    		.forEach(({card, originalIndex}) => {
        const cardEl = createCard(card);
        cardEl.onclick = () => {
            if (!self.played_card && !waitingForStack) {
                ws.send(JSON.stringify({
                    type: "play_card",
                    token,
                    index: originalIndex
                }));
            }
        };
        handEl.appendChild(cardEl);
    });

    if (self.played_card) {
        const card = createCard(self.played_card);
        card.classList.add("played");
        playedEl.appendChild(card);
    }
}

/* ---------- Others ---------- */
function renderOthers(others) {
    const container = document.getElementById("others-played");
    container.innerHTML = "";

    Object.entries(others).forEach(([player, data]) => {
        const wrapper = document.createElement("div");
        wrapper.className = "played-wrapper";
        wrapper.dataset.playerId = player;

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
	  el.className = `card value-${card.value}`;

	  el.innerHTML = `
		    <div class="face">${card.face}</div>
		    <div class="value">${card.value}</div>
	  `;
	  return el;
}

/* ---------- Animations ---------- */
function stackAddElement(i) {
  const stacks = document.getElementById("stacks");
  const row = stacks.children[i]; // the stack row
  const ph = document.createElement("div");
  ph.className = "card placeholder";
  row.appendChild(ph);
  return ph;
}

function flyCard(cardEl, fromEl, toEl, { duration = 300 } = {}) {
  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();

  const clone = cardEl.cloneNode(true);
  clone.classList.add("flying");
  document.body.appendChild(clone);

  clone.style.transitionDuration = `${duration}ms`;

  // start position
  clone.style.left = `${from.left}px`;
  clone.style.top = `${from.top}px`;

  // force layout
  clone.getBoundingClientRect();

  const dx = to.left - from.left;
  const dy = to.top - from.top;

  return new Promise((resolve) => {
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clone.remove();
      resolve();
    };

    clone.addEventListener("transitionend", finish, { once: true });

    // animate
    clone.style.transform = `translate(${dx}px, ${dy}px)`;

    // fallback in case transitionend doesn't fire
    setTimeout(finish, duration + 50);
  });
}

function createQueue() {
  let chain = Promise.resolve();

  return {
    add(task) {
      // task can be sync or async
      chain = chain.then(() => task()).catch(console.error);
      return chain; // optional: lets you await "until everything so far is done"
    }
  };
}

const q = createQueue();

function processAnimations(animations) {
  for (const anim of animations) {
    q.add(() => {
      if (anim.action === "play_card") {
      	const playerEl = document.querySelector(`[data-player-id="${anim.player}"]`);
        if (!playerEl) return;
        const start = playerEl.querySelector(".played");
        if (!start) return;

        const to = stackAddElement(anim.stack);
        return flyCard(start, start, to, { duration: 2000 });
      }

      if (anim.action === "pick_stack") {
     		const playerEl = document.querySelector(`[data-player-id="${anim.player}"]`);
        if (!playerEl) return;
        const stacksEl = document.getElementById("stacks");
        const stackEl = stacksEl.children[anim.stack];
        if (!stackEl) return;

        // animate cards one-by-one
        let p = Promise.resolve();
        for (const cardEl of stackEl.children) {
          p = p.then(() => flyCard(cardEl, cardEl, playerEl, { duration: 1000 }));
        }
        return p;
      }

      if (anim.action === "reveal_cards") {
        for (const [conn, card] of Object.entries(anim.revealed_cards)) {
        	const playerEl = document.querySelector(`[data-player-id="${conn}"]`);
          if (!playerEl) return;
          
          const cardEl = createCard(card);
          cardEl.classList.add("played");
          
          const old = playerEl.querySelector(".played");
          if (old) old.replaceWith(cardEl);
          else playerEl.appendChild(cardEl);
        }
      }
    });
  }
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

    if (msg.type === "gamestate" || msg.type === "reconnect_ok") {
      waitingForStack = !!msg.state.waiting_for_stack;
      q.add(() => { renderGame(msg.state); });
    }
    
    if (msg.type === "animations") {
      processAnimations(msg.animations); // this enqueues animations
    }
};

ws.onerror = (e) => console.error("WebSocket error:", e);
ws.onclose = () => console.log("Connection closed by server.");
