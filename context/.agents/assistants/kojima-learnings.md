# Kojima Learnings

## 2026-04-28: Progress Cues Should Confirm Reachable Mastery, Not Replace It

Topic: sticky arcade progression works best when visible progress reinforces competence and near-term attainability instead of burying the core loop under reward noise.

Durable learnings:

* Visible progress is strongest when it points at a goal the player believes they can reach soon through play, not when it is a detached meta meter.
* For short-run arcade stickiness, first give the player a believable next target: next hit threshold, next phase, next upgrade, next rank, next unlock. Then show progress toward it clearly.
* "Start-ahead" progress can increase follow-through, but only if the remaining work still feels honest and legible. Fake generosity with muddy effort math risks trust.
* Extrinsic reward layers can boost short-term push, but they should sit on top of an already satisfying control-feedback loop. If the loop itself is weak, more badges and currencies are usually camouflage.
* Competence and autonomy still matter more than reward spam. If progress bars advance while the player feels confused, powerless, or unable to improve, motivation quality drops.
* Good playtest check: when players chase the next goal, are they excited by improving at the game, or only by filling the meter?
* Good HUD bias: keep one primary progress target visible during active play; move secondary quests, currencies, and long-tail meta systems out of the focal play band.

Evidence shape:

* Ryan, Rigby, and Przybylski found enjoyment and preference track perceived competence and autonomy in game play, which argues that progression works best when it supports those needs.
* Teng found sustained game usage rose with perceived goal proximity, gaming self-efficacy, and expectancy for character growth, which supports clear near-term progression targets.
* Nunes and Dreze showed endowed progress increases completion effort, which supports giving players a legible sense that a run or upgrade path is already underway.
* Murayama et al. showed performance-contingent external rewards can undermine intrinsic motivation, which warns against leaning too hard on extrinsic progression wrappers.

Weak-evidence caution:

* The evidence base mixes video-game studies with broader motivation and consumer-behavior work. It is good for evaluation heuristics, not for claiming one universal battle-pass, XP bar, or upgrade cadence.
* Endowed-progress results are not a license for manipulative fake progress. In arcade evaluation, treat them as guidance for framing reachable goals, then check whether players still trust the system after a few runs.

Sources:

* Ryan, Rigby, Przybylski. "The Motivational Pull of Video Games: A Self-Determination Theory Approach." PDF: <https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf>
* Teng. "Drawing goals nearer: Using the goal-gradient perspective to increase online game usage." DOI/abstract: <https://doi.org/10.1016/j.ijinfomgt.2022.102522>
* Nunes, Dreze. "The Endowed Progress Effect: How Artificial Advancement Increases Effort." PDF: <https://msbfile03.usc.edu/digitalmeasures/jnunes/intellcont/endowed%20progress%20effect-1.pdf>
* Murayama et al. "Neural basis of the undermining effect of monetary reward on intrinsic motivation." PubMed: <https://pubmed.ncbi.nlm.nih.gov/21078974/>

## 2026-04-28: Recognition-First Onboarding Beats Memorize-First Tutorials

Topic: onboarding should minimize recall load, scale with mechanic complexity, and teach at point of use.

Durable learnings:

* Tutorial weight should scale with loop complexity. Simple arcade loops often need little more than safe first interaction plus visible affordances.
* If mechanic matters soon, teach it right before first use, not in a front-loaded rules dump.
* Good onboarding shows action, then lets player perform action immediately with feedback. "Explain now, practice later" is weak.
* Keep critical control/context info visible or easy to re-open. Do not assume new players will remember one-shot instructions under pressure.
* Labels, prompts, and tooltips should sit close to relevant control or play-space object so player does not translate across screen.
* Good playtest check: after first failure, can player recover from visible game state alone, or do they need to remember forgotten text?
* Good complexity check: if game is still fun and understandable during first 20-30 seconds of unguided safe play, long tutorial likely over-teaching.

Evidence shape:

* Heliyon review/pilot says tutorials matter more for complex games, and learning improves when players can practice on their own, get timely feedback, and access guidance just in time.
* Nielsen Norman Group's recognition-over-recall heuristic says needed information should stay visible or easily retrievable, and help should be in-context rather than a long tutorial to memorize.
* Microsoft XAG 114 says UI should provide enough context for purpose, operation, and expected result before interaction, with labels positioned near associated elements.
* Game Accessibility Guidelines says temporary essential gameplay info should stay near player eye-line; stable edge UI is fine once players know where to look.

Weak-evidence caution:

* Strongest direct game-specific evidence here is still thin. Heliyon review says tutorial research remained deficient through 2017, and newer controlled work is still sparse. Treat this as robust direction, not proof that implicit onboarding always beats explicit teaching.
* "No tutorial" is not default virtue. Complex or low-affordance mechanics still need explicit support; test whether first-use failure teaches or only confuses.

Sources:

* Cao, Liu. "Learning to play: understanding in-game tutorials with a pilot study on implicit tutorials." Heliyon / ScienceDirect: <https://doi.org/10.1016/j.heliyon.2022.e11482>
* Nielsen Norman Group. "Jakob's Heuristic 6: Recognition Rather Than Recall." PDF: <https://media.nngroup.com/media/articles/attachments/Heuristic_6_Letter_compressed.pdf>
* Microsoft Learn. "Xbox Accessibility Guideline 114: UI context." <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/114>
* Game Accessibility Guidelines. "Avoid placing essential temporary information outside the player's eye-line." <https://gameaccessibilityguidelines.com/avoid-placing-essential-temporary-information-outside-the-players-eye-line/>

## 2026-04-28: Action Readability Under Pressure

Topic: focal-action-adjacent cues beat edge-separated temporary cues.

Durable learnings:

* Must-react prompts, warning flashes, and short-lived hit feedback belong near player focal action, not only on screen edge.
* Stable edge HUD works for persistent state players can choose to check, like score, stock, health, or cooldown summary.
* If player must keep track of many moving things, readability budget shrinks fast. Treat 4+ simultaneous moving demands as danger zone for missed cues.
* Clutter and eccentricity compound each other. Cue readable in isolation can still fail in live play when hazards overlap, move fast, or sit far from gaze.
* Good playtest check: can player respond while watching avatar, enemy, or lane of danger, without eye-jumping to HUD first?
* Good failure test: if cue is only noticed when paused, replayed, or deliberately searched for, cue failed live readability.
* If edge placement is unavoidable, duplicate cue with earlier telegraph, stronger motion/contrast, or second channel. Do not rely on one brief flash.

Evidence shape:

* Game Accessibility Guidelines says essential temporary information should not sit outside player eye-line, while familiar persistent edge UI is usually fine.
* Multiple-object tracking research shows divided visual attention is limited; common lab capacity lands around 4 to 5 tracked objects, with speed and proximity making tracking worse.
* Change blindness and inattentional blindness work shows visible events can still be missed when attention is occupied elsewhere.
* Peripheral-vision research says clutter creates crowding, which makes object recognition in periphery much worse.

Weak-evidence caution:

* Do not turn lab numbers into hard design law. "4 to 5 objects" is risk flag for action readability, not universal cap for every arcade encounter.

Sources:

* Game Accessibility Guidelines: <https://gameaccessibilityguidelines.com/avoid-placing-essential-temporary-information-outside-the-players-eye-line/>
* Meyerhoff, Papenmeier, Huff. "Studying visual attention using the multiple object tracking paradigm: A tutorial review." PubMed: <https://pubmed.ncbi.nlm.nih.gov/28584953/>
* Simons, Rensink. "Change blindness and inattentional blindness." PubMed: <https://pubmed.ncbi.nlm.nih.gov/26302304/>
* Strasburger, Rentschler, Juttner. "Peripheral vision and pattern recognition: a review." PubMed: <https://pubmed.ncbi.nlm.nih.gov/22207654/>
* Levi. "Crowding--an essential bottleneck for object recognition: a mini-review." PMC: <https://pmc.ncbi.nlm.nih.gov/articles/PMC2268888/>

## 2026-04-28: Telegraphs Should Predict Collision, Not Just Flash Danger

Topic: dodge telegraphs get read faster when they imply where and when impact will happen.

Durable learnings:

* Telegraphs for dodgeable attacks should communicate trajectory and arrival, not only "danger now." Players read impending collision more readily than abstract urgency.
* Expanding or advancing motion is a strong urgency cue. If an attack is meant to be reacted to, show approach or sweep direction early enough that the player can map it to a body-space threat.
* Visual telegraph stays primary for precision. Looming or rising audio can add urgency and pull attention, but it is weaker as the sole source for exact timing or location.
* Audio support is most useful when visual TTC judgment is degraded, like fast acceleration, clutter, or off-center threats. Even then, treat it as correction, not replacement.
* Good playtest check: on first encounter, can the player point to where the hit will land before release, not just say that "something bad" is coming?
* Good implementation bias: prefer windup shapes that preserve a clear future path over decorative charge effects that hide the path.

Evidence shape:

* Collision-path visual stimuli capture attention more strongly than near-miss stimuli, even when immediate display features are matched.
* Newer neural work suggests collision-trajectory detection has fast automatic processing routes, which supports using body-threatening motion as a core telegraph language.
* Auditory looming cues can redirect and sustain visuospatial attention, and recent TTC work suggests audio can partially correct visual overestimation under acceleration, but visual information still dominates precision judgments.
* Accessibility guidance still applies: essential temporary info should remain near the eye-line, so telegraph audio should reinforce the visual cue rather than excuse bad placement.

Weak-evidence caution:

* Most strong evidence here comes from perception and driving-style TTC tasks, not shipped action games. Use it to shape telegraph readability tests, not to overfit one exact windup duration or FX style.

Sources:

* Lin, Franconeri, Enns. "Objects on a Collision Path With the Observer Demand Attention." PDF: <https://visualthinking.psych.northwestern.edu/publications/publications/LinFranconeriEnns2008Collision.pdf>
* Hu et al. "Human subcortical pathways automatically detect collision trajectory without attention and awareness." PLOS Biology: <https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3002375>
* Glatz, Chuang. "The time course of auditory looming cues in redirecting visuo-spatial attention." Scientific Reports: <https://www.nature.com/articles/s41598-018-36033-8>
* Leblond et al. "Audiovisual estimation of time-to-contact." PDF: <https://artefacts-discovery.researcher.life/full_text/DA-2/0e/0e27f4aba00233559949d34930f819b8/full_text/6c74621c2619cba271e38bd5d1ba17f5.pdf>
* Game Accessibility Guidelines. "Avoid placing essential temporary information outside the player's eye-line." <https://gameaccessibilityguidelines.com/avoid-placing-essential-temporary-information-outside-the-players-eye-line/>

## 2026-04-28: Difficulty Control Should Be Goal-Driven, Player-Legible, and Low-Friction

Topic: how arcade games should expose manual difficulty versus hidden dynamic adjustment.

Durable learnings:

* Do not treat adaptive difficulty as automatic good. Recent studies still show mixed player-experience gains, so fixed presets plus assists remain a strong default.
* Difficulty system should start from design goal, not vague "keep flow." Decide whether goal is onboarding retention, mastery runway, accessibility, or anti-stall recovery, then tune around that.
* For player-facing choices, periodic or diegetically integrated adjustment beats constant direct prompting. Asking too often makes difficulty management itself become work.
* In arcade loops, manual presets should preserve the same core game while scaling pressure variables like damage, spawn density, timing leniency, or recovery forgiveness.
* Let players change difficulty during play without restart or progress loss. If only one part of the game is the blocker, expose discrete assists instead of forcing one global preset.
* Hidden DDA should be low-salience and narrow in scope. If it visibly rewrites outcomes, players may read it as rubber-banding or loss of agency.
* Good analysis question for playtests: did the player fail because the loop was too hard, or because the game hid which knob would have helped them?

Evidence shape:

* Hunicke's foundational DDA paper argues adjustment works best when it avoids disrupting the core experience and can even benefit from low-visibility "change-blind" interventions.
* CHI PLAY 2019 found integrated difficulty choices improved some player-experience dimensions, while offering choices only once or constantly performed worse than periodic presentation.
* Microsoft XAG 108 treats difficulty as subjective, recommends multiple presets, changing difficulty at any time, and discrete mechanic-level assists.
* A 2024 review argues DDA has been over-tied to Flow theory and should instead be designed toward specific game-design goals.
* A 2024 empirical DDA study found no single adaptive method clearly beat static difficulty overall, reinforcing that DDA is not a free win.

Weak-evidence caution:

* Much of this evidence comes from HCI research, controlled studies, FPS-like prototypes, and accessibility guidance, not shipped browser arcade games at catalog scale.
* The literature supports principles for when and how to expose difficulty, but it does not give one universal cadence, one best prompt style, or one exact parameter set for every arcade genre.

Sources:

* Hunicke. "The Case for Dynamic Difficulty Adjustment in Games." ACE 2005 / ACM DOI: <https://dl.acm.org/doi/10.1145/1178477.1178573>
* Ang, Mitchell. "Representation and Frequency of Player Choice in Player-Oriented Dynamic Difficulty Adjustment Systems." CHI PLAY 2019 program summary: <https://chiplay.acm.org/2019/index.html%40p%3D1801.html>
* Microsoft Learn. "Xbox Accessibility Guideline 108: Game difficulty options." <https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/108>
* Guo, Thawonmas, Ren. "Rethinking dynamic difficulty adjustment for video game design." Entertainment Computing 2024: <https://doi.org/10.1016/j.entcom.2024.100663>
* Fisher, Kulshreshth. "Exploring Dynamic Difficulty Adjustment Methods for Video Games." Virtual Worlds 2024: <https://doi.org/10.3390/virtualworlds3020012>

## 2026-04-28: Low-Latency Response Budget Beats Extra Juice

Topic: for action and arcade feel, predictable control-response usually matters before adding more FX, shake, or complexity.

Durable learnings:

* Treat input-to-visible-response budget as core mechanic, not polish pass. If controls feel late, players misread timing, distance, and fairness.
* Latency hurts two layers at once: objective performance and subjective control. Players do worse, then also trust game less.
* Small latency still matters. HCI evidence shows measurable degradation can begin around 16 ms, and effect is not nicely linear.
* For timing-heavy or continuous-control loops, every extra frame counts more than many teams assume. A 60 Hz frame is about 16.7 ms, so one avoidable frame can already be meaningful.
* If game must render continuously, input should be read as late as practical and not wait behind presentation work. Separate input handling is worth biasing toward for action, rhythm, fighting, and tight dodge loops.
* When evaluating feel, ask first: "Did player miss because decision was wrong, or because game answered too late for correction?" This catches fake difficulty caused by sluggish response.
* Design triage rule: before tuning enemy speed, telegraph length, knockback, or juice, verify control-response path. Bad latency can masquerade as bad balance.
* Perspective alone is weak predictor for latency tolerance. Recent controlled work found latency damage across first-person, third-person, and bird's-eye shooting alike, so judge by precision and correction demands, not camera label.

Evidence shape:

* Microsoft guidance for low-latency games says 60 fps loops can add up to 16.7 ms if blocked on sync, and recommends separate-thread input when low latency is critical.
* Friston et al. found performance effects beginning around 16 ms in pointing and steering tasks, with non-linear degradation.
* Claypool and Finkel found cloud-game player performance dropping about 25% per added 100 ms in third-person/avatar-style tests, and observed cloud games behaving more like latency-sensitive first-person games than genre labels would suggest.
* Halbhuber et al. found worse reaction time, accuracy, ease of control, challenge fit, immersion, and enjoyment under higher latency, independent of first-person, third-person, or bird's-eye perspective.

Weak-evidence caution:

* Most evidence here comes from HCI tasks, cloud gaming, and controlled shooting/pointing studies, not broad shipped browser-arcade catalogs.
* Do not turn "16 ms matters" into rigid universal threshold. Exact tolerance depends on action type, correction window, display refresh, baseline device lag, and whether loop is discrete-timing or continuous steering.

Sources:

* Microsoft Learn. "Optimize input latency for UWP DirectX games." <https://learn.microsoft.com/en-us/windows/uwp/gaming/optimize-performance-for-windows-store-direct3d-11-apps-with-coredispatcher>
* Friston, Karlstrom, Steed. "The Effects of Low Latency on Pointing and Steering Tasks." IEEE TVCG 2016 / UCL PDF: <https://wp.cs.ucl.ac.uk/sebastianfriston/wp-content/uploads/sites/3/2014/09/The-Effects-of-Low-Latency-on-Pointing-and-Steering-Tasks.pdf>
* Claypool, Finkel. "The Effects of Latency on Player Performance in Cloud-based Games." IEEE 2014 / WPI PDF: <https://web.cs.wpi.edu/~claypool/papers/cloud-games/paper.pdf>
* Halbhuber, Schauhuber, Schwind, Henze. "The Effects of Latency and In-Game Perspective on Player Performance and Game Experience." Proc. ACM HCI / CHI PLAY 2023: <https://doi.org/10.1145/3611070>

## 2026-04-28: Fast Retry Turns Failure Into Practice

Topic: sticky arcade loops get stronger when death-to-retry friction is tiny enough that failure stays inside the learning loop.

Durable learnings:

* If the game expects frequent death, restart should be nearly immediate and deterministic. Reloads, menu hops, and long checkpoint animations convert practice into idle time.
* Short challenge chunks pair best with fast retry. Asking for 3 to 10 seconds of precision is often healthy; replaying 30 solved seconds to re-attempt 1 hard second is usually friction.
* Keep the corrective context intact across death. Same camera, same controls, and one-button retry help players act on the mistake while it is still fresh.
* Avoid death interstitials that steal attention from the next attempt. Modal confirmations, score ceremonies, and narrative delays are expensive in mastery-first arcade play.
* Fast retry is only good when the failure was legible. If the player cannot tell what went wrong, instant restart just accelerates frustration.
* Good playtest check: within about 2 seconds of failing, is the player already applying a new idea, or are they still waiting, navigating UI, or cooling off?
* Good design bias: tune retry speed before adding more meta rewards. In precision arcade games, restart latency is part of the core mechanic feel.

Evidence shape:

* Deliberate-practice research centers improvement on clear goals, immediate feedback, and repeated correction of errors, which maps closely to tight retry loops.
* Feedback-timing research distinguishes learning from immediate versus delayed feedback, with immediate feedback strongly tied to rapid reinforcement-style correction.
* Developer-authored platformer writeups explicitly frame the genre's appeal around fail-learn-retry loops and dedicated retry buttons with no lengthy gaps.

Weak-evidence caution:

* The evidence is mixed across domains. Some non-arcade learning studies find delayed feedback can improve later retention, especially for verbal or recall-heavy tasks. Do not overgeneralize "immediate is always better."
* Direct controlled studies on commercial arcade restart latency are still thin. Treat this as a strong evaluation heuristic, then verify with drop-off after death, abandonment after repeated fails, and whether players can state what they will try next.

Sources:

* Duckworth, Kirby, Tsukayama, Berstein, Ericsson. "Using Wise Interventions to Motivate Deliberate Practice." PMC: <https://pmc.ncbi.nlm.nih.gov/articles/PMC5091297/>
* Eppinger, Schuck, Nystrom, Cohen. "Feedback-Based Learning in Aging: Contributions and Trajectories of Change in Striatal and Hippocampal Systems." PubMed: <https://pubmed.ncbi.nlm.nih.gov/30120208/>
* Plaßmann. "How Super Meat Boy 3D captures the series' identity, out March 31." PlayStation Blog, March 26, 2026: <https://blog.playstation.com/2026/03/26/how-super-meat-boy-3d-captures-the-series-identity-out-may-31/>
* Pearce. "Furiously Fast Platformer 10 Second Ninja X Coming to PS4, PS Vita." PlayStation Blog, March 2, 2016: <https://blog.playstation.com/2016/03/02/furiously-fast-platformer-10-second-ninja-x-coming-to-ps4-ps-vita/>
* Smith, Kimball. "Delaying feedback by three seconds benefits retention of face-name pairs: the role of active anticipatory processing." Memory & Cognition: <https://link.springer.com/article/10.3758/s13421-011-0092-1>
