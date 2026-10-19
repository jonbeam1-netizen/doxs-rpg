// Rotwell University course catalog (and night school).
// A course meets once a day at `hour` for `len` hours. Show up within 30 minutes of the start
// (or arrive early and wait). Each session gives `gain`; finishing gives `bonus` + a perk.
// req: stat minimums to enroll. perk: free-form id other systems check with jobs/course helpers.
export const COURSES = {
  remedial_math: {
    name: 'Remedial Math for Adults Who Should Know Better', short: 'Remedial Math', fee: 150, sessions: 5, hour: 8, len: 2,
    gain: { int: 1.6 }, bonus: { int: 3 }, req: {},
    prof: 'Mr. Pindle', desc: 'Counting past ten without using your toes. Graduates can calculate a 15% tip (they still won\'t).',
    perk: 'math', perkText: 'Dealers can\'t short you: +5% on every drug sale.',
  },
  bs101: {
    name: 'BS 101: Intro to Bullshitting', short: 'Bullshitting', fee: 300, sessions: 6, hour: 10, len: 2,
    gain: { int: 0.8, cha: 1.2 }, bonus: { cha: 4 }, req: { int: 8 },
    prof: 'Professor Blowhard', desc: 'Speak confidently about things you know nothing about. Prerequisite for management.',
    perk: 'bs', perkText: 'Better tips on every job and +flirt success.',
  },
  crim_justice: {
    name: 'Criminal Justice (Mostly Criminal)', short: 'Criminal Justice', fee: 1200, sessions: 8, hour: 13, len: 2,
    gain: { int: 2.0 }, bonus: { int: 5, karma: 2 }, req: { int: 20 },
    prof: 'Sgt. (Ret.) Donna Baton', desc: 'Learn the law so you know which parts to break. Required for Detective rank at Rotwell PD.',
    perk: 'crim', perkText: 'Required for Detective+ at the PD. Heat payoffs 25% cheaper.',
  },
  chem: {
    name: 'Kitchen Chemistry (Ask No Questions)', short: 'Kitchen Chemistry', fee: 900, sessions: 7, hour: 15, len: 2,
    gain: { int: 2.2 }, bonus: { int: 4 }, req: { int: 25 },
    prof: 'Dr. Walt Blanco', desc: 'The professor drives an RV and has a cough. Unrelated, he says.',
    perk: 'chem', perkText: 'You can "step on" your product: sell drugs for +10%.',
  },
  psych: {
    name: 'Psychology of Manipulation', short: 'Manipulation', fee: 1500, sessions: 8, hour: 11, len: 2,
    gain: { int: 1.4, cha: 1.6 }, bonus: { cha: 6 }, req: { int: 30 },
    prof: 'Dr. Gaslight', desc: 'You definitely already signed up for this. Don\'t you remember? You\'re being crazy.',
    perk: 'psych', perkText: 'Dating meters fill 30% faster.',
  },
  naps: {
    name: 'Phys Ed: Advanced Napping', short: 'Advanced Napping', fee: 400, sessions: 6, hour: 7, len: 2,
    gain: { str: 1.0, int: 0.4 }, bonus: { str: 3 }, req: {},
    prof: 'Coach Dozer', desc: 'Half dodgeball, half power naps. Graduates sleep like the dead (rested).',
    perk: 'naps', perkText: '+10 max energy.',
  },
  mba: {
    name: 'MBA in Synergy (Night School)', short: 'MBA in Synergy', fee: 4500, sessions: 10, hour: 19, len: 3,
    gain: { int: 2.4, cha: 1.0 }, bonus: { int: 8, cha: 5 }, req: { int: 50, cha: 30 },
    prof: 'Chad Thundervest, MBA', desc: 'Leverage your core competencies to circle back on paradigm shifts. Required for VP at Grimco.',
    perk: 'mba', perkText: 'Required for VP/CEO at Grimco. Bank interest +50%.',
  },
  law: {
    name: 'Pre-Law: Loopholes & You', short: 'Pre-Law', fee: 6000, sessions: 10, hour: 9, len: 3,
    gain: { int: 3.0 }, bonus: { int: 10 }, req: { int: 70 },
    prof: 'Judge Gavelton (Disbarred)', desc: 'The law is a maze. Learn to tunnel under it like a gopher in a suit.',
    perk: 'law', perkText: 'Fines and bail are halved. Required for Police Chief.',
  },
  premed: {
    name: 'Pre-Med: Bodies & Gross Stuff', short: 'Pre-Med', fee: 8000, sessions: 12, hour: 14, len: 3,
    gain: { int: 3.2 }, bonus: { int: 10 }, req: { int: 80 },
    prof: 'Dr. Sawbones', desc: 'Dissect a frog. Then a pig. Then something the meat plant dropped off. Don\'t ask.',
    perk: 'premed', perkText: '+25 max HP and 50% off at St. Mercy\'s.',
  },
};
