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

// Pop-quiz banks for the class minigame (src/systems/mg/train.js). a[0] is always the correct answer
// (options are shuffled at runtime). The right answer should be gettable by common sense + the joke.
export const QUIZ = {
  general: [
    { q: 'What is 2 + 2?', a: ['4', '22', 'Fish', 'Depends who\'s asking'] },
    { q: 'Which of these is a vegetable?', a: ['Carrot', 'Hot Pocket', 'Gary', 'Rotwell Hot Dog'] },
    { q: 'The capital of Rotwell is:', a: ['Rotwell', 'Pizza Butt', 'Debt', 'Under the bridge'] },
    { q: 'How many legs does a spider have?', a: ['8', '6', '3 and a bad attitude', 'Ask the meat plant'] },
    { q: 'Water is:', a: ['Wet', 'Dry', 'A government lie', 'Beer\'s ex'] },
  ],
  remedial_math: [
    { q: 'You have 3 beers. You drink 2. How many beers do you have?', a: ['1', '5', 'Not enough', 'Your dad\'s number'] },
    { q: 'What is 10% of $50?', a: ['$5', '$10', '$0.50', 'A tip I won\'t leave'] },
    { q: 'Which number is bigger: 1/3 or 1/4?', a: ['1/3', '1/4, because 4 is bigger', 'They\'re both pizza', 'Neither, math is fake'] },
    { q: 'A pizza has 8 slices. Tony eats 3 "taste tests". How many are left?', a: ['5', '11', '8, Tony is lying', 'Zero, Tony is still hungry'] },
    { q: 'What is 7 × 6?', a: ['42', '76', '13', 'Something with a 4 in it'] },
    { q: 'A train leaves Rotwell at 60 mph. How far has it gone after 2 hours?', a: ['120 miles', 'Derailed', 'Still at the station', 'Into the river again'] },
    { q: 'Round 4.6 to the nearest whole number.', a: ['5', '4', '4.60', 'Round is a shape, not a verb'] },
  ],
  bs101: [
    { q: 'Your boss asks for a report you didn\'t do. You say:', a: ['"It\'s in your inbox." (It isn\'t.)', '"I didn\'t do it."', 'You start crying', 'You fake a seizure'] },
    { q: 'The most important part of a lie is:', a: ['Confidence', 'Facts', 'A fake mustache', 'Telling everyone it\'s a lie'] },
    { q: 'Someone asks a question you can\'t answer. The textbook BS response:', a: ['"Great question. Let\'s take that offline."', '"I don\'t know."', '"No."', 'You leave through a window'] },
    { q: 'Which word makes ANY sentence sound smarter?', a: ['"Fundamentally"', '"Duh"', '"Boobs"', '"Allegedly"'] },
    { q: 'Professor Blowhard has read how many of the books he lectures on?', a: ['Zero', 'All of them', 'Most of them', 'He wrote them (he didn\'t)'] },
    { q: 'You show up late to a meeting. You say:', a: ['"Sorry, I was on a call with legal."', '"I overslept."', '"I was pooping."', 'Nothing. You crawl in.'] },
  ],
  crim_justice: [
    { q: 'You have the right to remain:', a: ['Silent', 'Sexy', 'In the cruiser', 'Kinda chatty'] },
    { q: 'What does a cop need to search your house?', a: ['A warrant', 'A good vibe', 'A ladder', 'Your mom\'s permission'] },
    { q: '"Innocent until proven ___."', a: ['Guilty', 'Rich', 'Annoying', 'Ugly'] },
    { q: 'Evidence found in Chief Hamhock\'s desk is mostly:', a: ['Donuts', 'Fingerprints', 'Confessions', 'Other cops'] },
    { q: 'A suspect says "I want a lawyer." You should:', a: ['Stop questioning them', 'Get them a lawyer costume', 'Ask "a lawyer for WHAT?"', 'Laugh menacingly'] },
    { q: 'What is "probable cause"?', a: ['A reasonable basis to believe a crime happened', 'When someone looks shifty', 'A ska band', 'Gristle\'s nickname'] },
  ],
  chem: [
    { q: 'What is H₂O?', a: ['Water', 'Hot 2 Orgy', 'Two hydrogens and a feeling', 'A dog\'s name'] },
    { q: 'Mixing bleach and ammonia makes:', a: ['Toxic gas. Don\'t.', 'A smoothie', 'Extra clean', 'A new friend'] },
    { q: 'Dr. Blanco\'s RV is used for:', a: ['"Camping" (wink)', 'Camping (no wink)', 'Storing his cough', 'Tax fraud only'] },
    { q: 'What do you wear when handling chemicals?', a: ['Goggles and gloves', 'Vibes', 'Nothing, for science', 'A Pizza Butt hat'] },
    { q: 'The pH of something very acidic is:', a: ['Low (like 1-2)', 'High (like 12)', 'Exactly "spicy"', 'Rotwell tap water'] },
    { q: 'Which element is a noble gas?', a: ['Neon', 'Rotgut', 'Gravy', 'Lead (it\'s very classy)'] },
  ],
  psych: [
    { q: 'Mirroring someone\'s body language makes them:', a: ['Like you more', 'Call the police', 'Mirror you harder', 'Turn into you'] },
    { q: 'Dr. Gaslight says class was cancelled. You:', a: ['Go to class anyway', 'Go home', 'Question your own memory', 'Apologize to him'] },
    { q: 'The best way to remember someone\'s name is to:', a: ['Repeat it back to them', 'Tattoo it on your hand', 'Call everyone "buddy"', 'Ask them every ten minutes'] },
    { q: 'Freud thought everything was about:', a: ['Your mother (mostly)', 'Taxes', 'Spoons', 'Pizza'] },
    { q: 'Someone is crossing their arms. They are probably:', a: ['Defensive (or cold)', 'Hugging themselves romantically', 'A genie', 'About to dab'] },
    { q: '"Reverse psychology" means:', a: ['Asking for the opposite of what you want', 'Walking backwards to class', 'Psychology for Australians', 'Reading textbooks upside down'] },
  ],
  naps: [
    { q: 'The ideal power nap is about:', a: ['20 minutes', '9 hours', '2 seconds', 'Until someone checks your pulse'] },
    { q: 'If you can dodge a ___, you can dodge a ball.', a: ['Wrench', 'Tax audit', 'Responsibility', 'Gary'] },
    { q: 'Coach Dozer\'s Power Nap Position is:', a: ['Face down on the desk', 'Standing like a horse', 'Inside a locker', 'On top of Coach Dozer'] },
    { q: 'What is cardio?', a: ['Exercise that gets your heart pumping', 'A brand of cheese', 'An Italian card game', 'Running from the cops (also yes)'] },
    { q: 'You should stretch:', a: ['Before and after exercise', 'Never', 'Only the truth', 'Your budget'] },
    { q: 'Coach Dozer\'s whistle is mostly used for:', a: ['Waking people up', 'Summoning dogs', 'Jazz', 'Scaring raccoons'] },
  ],
  mba: [
    { q: 'What does "synergy" mean?', a: ['Nobody knows. Say it anyway.', 'Working together', 'A sports drink', 'A sin you commit with energy'] },
    { q: 'Profits are down. The textbook MBA move is to:', a: ['Fire 3,000 people, give yourself a bonus', 'Give everyone a raise', 'Cry in the parking lot', 'Hire a wizard'] },
    { q: '"Low-hanging fruit" means:', a: ['Easy wins', 'Gristle\'s pants', 'Actual fruit', 'A grocery store accident'] },
    { q: 'What is a "golden parachute"?', a: ['A huge payout when an exec gets fired', 'Fancy skydiving', 'A sex thing (it\'s not)', 'A Grimco bathroom'] },
    { q: 'This meeting could have been:', a: ['An email', 'A nap', 'Two meetings', 'A murder'] },
    { q: 'ROI stands for:', a: ['Return On Investment', 'Rotwell Organized Idiots', 'Really Obvious Information', 'Roi, a French king'] },
  ],
  law: [
    { q: 'A contract signed on a napkin is:', a: ['Possibly still binding', 'Never binding', 'Only binding at diners', 'Just a napkin'] },
    { q: '"Objection!" is used when:', a: ['The other side does something improper', 'You\'re bored', 'You\'re losing', 'You need to sneeze'] },
    { q: 'What is a "loophole"?', a: ['A gap in the rules you can legally exploit', 'A pretzel', 'Judge Gavelton\'s belt', 'A donut for lawyers'] },
    { q: 'Judge Gavelton was disbarred for:', a: ['He won\'t say', 'Being too honest', 'Excessive gaveling', 'Being a raccoon in a robe'] },
    { q: 'Attorney-client privilege means:', a: ['Your lawyer can\'t snitch on you', 'Free mints', 'Lawyers board planes first', 'You can date your lawyer'] },
    { q: 'In a criminal trial, the burden of proof is on:', a: ['The prosecution', 'The defendant', 'The bailiff\'s back', 'Whoever looks guiltier'] },
  ],
  premed: [
    { q: 'How many chambers does the human heart have?', a: ['4', '1 big one', '12, like an apartment', 'Depends on the meat plant'] },
    { q: 'What is the largest organ of the human body?', a: ['The skin', 'The liver', 'Gristle\'s ego', 'The appendix (look it up — no, don\'t)'] },
    { q: 'CPR stands for:', a: ['Cardiopulmonary Resuscitation', 'Call Pizza Restaurant', 'Cool People Rule', 'Certified Pretty Rough'] },
    { q: 'The femur is in your:', a: ['Thigh', 'Brain', 'Nose (deep in there)', 'Wallet'] },
    { q: 'Before surgery you should:', a: ['Wash your hands', 'Have a few beers', 'Google it', 'Name the patient "Steve"'] },
    { q: 'Something from the meat plant has too many legs. You should:', a: ['Report it to the health department', 'Name it', 'Eat it', 'Teach it to dance'] },
  ],
};
