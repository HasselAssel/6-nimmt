import random, json

class Game:
  def __init__(self):
    self.lobby_open = True
    self.waiting_for_card = set()
    self.waiting_for_stack = None
    self.players = {}
    self.deck = Deck([Card(i, 7 if i == 55 else
                    5 if i % 11 == 0 else
                    3 if i % 10 == 0 else
                    2 if i % 5 == 0 else
                    1) for i in range(1, 104+1)])
    self.stacks = tuple([] for _ in range(4))

  def get_player_infos(self, player):
   data = {
    "players": list(self.players.keys()),
    "waiting_for_stack": self.waiting_for_stack,
    "waiting_for_card": list(self.waiting_for_card),
    "stacks": self.stacks,
    "self_conn": player,
    "self": self.players[player],
    "others": {
      player_conn: {
        "name": player_obj.name,
        "played_card": Card("?", "?") 
                      if not self.waiting_for_stack and player_obj.played_card 
                      else player_obj.played_card,
        "points": player_obj.points,
        "card_points": player_obj.card_points
      } for player_conn, player_obj in self.players.items() if player_conn != player
    }
   }
   return data

  def add_player(self, player, name):
    if self.lobby_open and len(self.players) < 10:
      self.players[player] = Player(name)
      return True
    return False

  def start(self):
    self.lobby_open = False
    self._reset_round()
    self._all_waiting_for_card()

  def play_card(self, player, index):
    if player in self.waiting_for_card:
      if self.players[player].play_card(index):
        self.waiting_for_card.remove(player)
      actions = self._check_everyone_played_card()
      return actions

  def choose_stack(self, player, index):
    if player == self.waiting_for_stack and 0 <= index and index < 4:
      player = self.players[player]
      correct_stack = self.stacks[index]
      player.card_points.extend(correct_stack)
      correct_stack.clear()
      correct_stack.append(player.played_card)
      
      player.played_card = None
      self.waiting_for_stack = None

      res, actions = self._play_on_stacks()
      return actions

  def _play_on_stacks(self):
    actions = []
    player_conns = sorted((conn for conn, player in self.players.items() if player.played_card is not None), 
                    key=lambda conn: self.players[conn].played_card.face)
    for conn in player_conns:
      player = self.players[conn]
      correct_index, correct_stack = max(((i, s) for i, s in enumerate(self.stacks) if s[-1].face < player.played_card.face),
                  key=lambda x: x[1][-1].face,
                  default=(None, None))
      if not correct_stack:
        self.waiting_for_stack = conn
        return False, actions
      if len(correct_stack) >= 5:
        player.card_points.extend(correct_stack)
        correct_stack.clear()
        actions.append({"action": "pick_stack", "stack": correct_index, "player": conn})
      correct_stack.append(player.played_card)
      actions.append({"action": "play_card", "stack": correct_index, "player": conn})
      player.played_card = None
    self._all_waiting_for_card()
    self._check_end_of_round()
    return True, actions

  def _check_end_of_round(self):
    if len(next(iter(self.players.values())).hand) == 0:
      self._reset_round()

  def _check_everyone_played_card(self):
    if len(self.waiting_for_card) == 0:
      reveal_action = {"action": "reveal_cards", "revealed_cards": {conn: player.played_card for conn, player in self.players.items()}}
      res, actions = self._play_on_stacks()
      return [reveal_action] + actions

  def _all_waiting_for_card(self):
    self.waiting_for_card.update(self.players.keys())

  def _reset_round(self):
    for stack in self.stacks:
      self.deck.return_cards(stack)
      stack.clear()
    for player in self.players.values():
      player.count_cards()
      self.deck.return_cards(player.return_cards())
      
    self.deck.shuffle()
    
    for stack in self.stacks:
      cards = self.deck.draw(1)
      stack.extend(cards)
    for player in self.players.values():
      cards = self.deck.draw(10)
      player.add_cards(cards)


class Card:
  def __init__(self, face, value):
    self.face = face
    self.value = value


class Deck:
  def __init__(self, cards):
    self.cards = cards

  def shuffle(self):
    random.shuffle(self.cards)

  def draw(self, amount):
    cards = []
    for _ in range(amount):
      cards.append(self.cards.pop())
    return cards

  def return_cards(self, cards):
    self.cards.extend(cards)


class Player:
  def __init__(self, name):
    self.name = name
    self.hand = []
    self.card_points = []
    self.points = 0
    self.played_card = None

  def add_cards(self, cards):
    self.hand.extend(cards)

  def count_cards(self):
    self.points += sum((card.value for card in self.card_points))

  def play_card(self, i):
    if 0 <= i and i < len(self.hand) and not self.played_card: 
      self.played_card = self.hand.pop(i)
      return True
    return False

  def return_cards(self):
    cards = []
    cards.extend(self.hand)
    self.hand.clear()
    cards.extend(self.card_points)
    self.card_points.clear()
    if self.played_card:
      cards.append(self.played_card)
      self.played_card = None
      print("Not Supposed To Happen")
    return cards
