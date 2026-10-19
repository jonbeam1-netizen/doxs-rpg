// One-liners NPCs say when you talk to them or walk past.
// Owned by the quests/story module, read by the NPC module via bark(kind).
// (Placeholder set — the story module expands this.)
export const BARKS = {
  ped: [
    "Don't make eye contact with me. I'm on a cleanse.",
    'Spare a dollar? No? Then spare me your face.',
    'This city smells like a hot dog that gave up.',
  ],
  thug: ['Nice face. Shame if someone rearranged it.', "You lost, stick boy?"],
  cop: ['Move along, citizen. Or don\'t. I get paid either way.'],
  hobo: ['The pigeons know things, man. THE PIGEONS KNOW.'],
  drunk: ["I'm not drunk, YOU'RE drunk. ...wait, which one of you said that?"],
  dealer: ['Psst. You lookin\'? I got the good stuff. And also the bad stuff. Mostly the bad stuff.'],
};

export function bark(kind) {
  const list = BARKS[kind] || BARKS.ped;
  return list[Math.floor(Math.random() * list.length)];
}
