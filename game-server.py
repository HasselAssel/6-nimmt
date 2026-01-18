import asyncio, json, socket, secrets
from aiohttp import web, WSMsgType
from game import Game

class GameServer:
  def __init__(self):
    self.game = Game()
    self.queue = asyncio.Queue()
    self.clients = {}

  async def ws_handler(self, request: web.Request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    try:
      async for msg in ws:
        if msg.type == WSMsgType.TEXT:
          await self.queue.put((ws, msg.data))
        elif msg.type == WSMsgType.ERROR:
          print("WS error:", ws.exception())
    finally:
      print("Client disconnected")

    return ws

  async def game_loop(self):
    while True:
      ws, raw_msg = await self.queue.get()

      try:
        msg = json.loads(raw_msg)
      except json.JSONDecodeError:
        print("Invalid message:", raw_msg)
        continue

      msg_type = msg.get("type")
      if not msg_type:
        continue

      if msg_type == "login":
        name = msg.get("name") or "NoName😔"
        token = secrets.token_urlsafe(32)
        ok = self.game.add_player(token, name)
        if ok:
          self.clients[token] = ws
        await ws.send_str(json.dumps({
          "type": "login_ok",
          "success": ok,
          "token": token if ok else None
        }))
        continue

      token = msg.get("token")
      if not token:
        continue

      if msg_type == "reconnect":
        if token in self.clients:
          self.clients[token] = ws
          await ws.send_str(json.dumps({
            "type": "reconnect_ok",
            "state": self.game.get_player_infos(token)
          }, default=lambda x: x.__dict__))
        continue

      elif msg_type == "start_game":
        if token in self.clients:
          self.game.start()
          await self.broadcast({"type": "start_game"})

      elif msg_type == "play_card":
        idx = msg.get("index")
        if idx is not None:
          self.game.play_card(token, idx)

      elif msg_type == "choose_stack":
        idx = msg.get("index")
        if idx is not None:
          self.game.choose_stack(token, idx)

      await self.broadcast_gamestate()

  async def broadcast(self, payload: dict):
    raw = json.dumps(payload)
    for t, ws in list(self.clients.items()):
      try:
        await ws.send_str(raw)
      except Exception:
        pass

  async def broadcast_gamestate(self):
    for token, ws in list(self.clients.items()):
      try:
        await ws.send_str(json.dumps({
          "type": "gamestate",
          "state": self.game.get_player_infos(token)
        }, default=lambda x: x.__dict__))
      except Exception:
        pass

async def main():
  gs = GameServer()
  asyncio.create_task(gs.game_loop())

  app = web.Application()
  app.router.add_get("/ws", gs.ws_handler)
  app.router.add_get("/", lambda r: web.FileResponse("./web/connect.html"))
  app.router.add_static("/", path="./web")

  runner = web.AppRunner(app)
  await runner.setup()
  site = web.TCPSite(runner, "0.0.0.0", 6767)
  await site.start()

  hostname = socket.gethostname()
  ip_addr = socket.gethostbyname(hostname)
  print(f"'{hostname}' hosting on http://{ip_addr}:6767  (WS at ws://{ip_addr}:6767/ws)")
  await asyncio.Future()

if __name__ == "__main__":
  asyncio.run(main())
