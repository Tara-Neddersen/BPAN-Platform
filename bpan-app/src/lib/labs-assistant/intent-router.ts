export type LabsAssistantIntent =
  | "greeting"
  | "smalltalk"
  | "booking.read.mine"
  | "booking.create"
  | "booking.reschedule"
  | "booking.status.update"
  | "equipment.read"
  | "reagent.location.read"
  | "reagent.arrival.read"
  | "announcement.create.draft"
  | "announcement.create.post"
  | "announcement.read"
  | "task.shared.read"
  | "meeting.create"
  | "meeting.read"
  | "message.send"
  | "group_chat.create"
  | "reagent.add"
  | "reagent.remove"
  | "equipment.add"
  | "equipment.remove"
  | "unknown";

function test(pattern: RegExp, value: string) {
  return pattern.test(value);
}

export function routeLabsAssistantIntent(question: string): LabsAssistantIntent {
  const q = question.toLowerCase().trim();
  if (!q) return "unknown";
  if (test(/^(hi|hey|hello|yo|sup|what's up|whats up)\b/i, q)) return "greeting";
  if (test(/^(how are you|how're you|hows it going|how is it going|what can you do|who are you|are you\b)\b/i, q)) return "smalltalk";
  if (test(/^(thanks|thank you|ok|okay|cool|nice)\b/i, q)) return "smalltalk";

  if (test(/\b(create|start|schedule|add|open)\b.*\bmeeting\b/i, q)) return "meeting.create";
  if (test(/\b(change|reschedule|move|shift|update)\b.*\b(booking|time|date|slot|it)\b/i, q)) return "booking.reschedule";
  if (test(/\b(cancel|confirm|complete|mark in use)\b.*\bbooking\b/i, q)) return "booking.status.update";
  if (test(/\b(add|create|new)\b.*\breagent\b/i, q)) return "reagent.add";
  if (test(/\b(remove|delete)\b.*\breagent\b/i, q)) return "reagent.remove";
  if (test(/\b(add|create|new)\b.*\bequipment\b/i, q)) return "equipment.add";
  if (test(/\b(remove|delete)\b.*\bequipment\b/i, q)) return "equipment.remove";
  if (test(/\b(create|start|open)\b.*\b(group chat|group thread|chat thread)\b/i, q)) return "group_chat.create";
  if (test(/\b(message|dm|direct message|group chat|chat with|tell)\b/i, q)) return "message.send";
  if (test(/\b(announcement|announce|post update|lab update|notice)\b/i, q) && test(/\b(draft|prepare|write)\b/i, q)) {
    return "announcement.create.draft";
  }
  if (test(/\b(announcement|announce|post update|lab update|notice)\b/i, q) && test(/\b(post|publish|send)\b/i, q)) {
    return "announcement.create.post";
  }
  if (test(/\b(announcement|announcements|notice|update)\b/i, q)) return "announcement.read";
  if (test(/\b(shared task|inspection task|inspection|todo|to-do)\b/i, q)) return "task.shared.read";
  if (test(/\b(meeting|meetings)\b/i, q)) return "meeting.read";
  if (test(/\b(make|need|want|wanna|would like|set up)\b/i, q) && test(/\b(booking|reservation)\b/i, q)) return "booking.create";
  if (test(/\b(book|reserve|schedule|create)\b/i, q)) return "booking.create";
  if (test(/\b(my|i|me)\b/i, q) && test(/\bbooking|bookings\b/i, q)) return "booking.read.mine";
  if (test(/\b(where|location|stored|store|shelf|freezer|fridge|rack)\b/i, q)) return "reagent.location.read";
  if (test(/\b(arrive|arrival|eta|when|ordered|order|delivery|delivered|receive|received)\b/i, q)) return "reagent.arrival.read";
  if (test(/\b(equipment|microscope|centrifuge|incubator|hood|book|booking|available|free|calendar)\b/i, q)) return "equipment.read";
  return "unknown";
}
