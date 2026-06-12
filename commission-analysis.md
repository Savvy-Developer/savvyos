# Commission Analysis

## Tyler's Tables for GL=10% (Agent=50%, Savvy=40%, GL=10%)

| Ref% | Agent | Savvy | Ref | GL  | Notes |
|------|-------|-------|-----|-----|-------|
| 30   | 50    | 20    | 30  | 0   | |
| 25   | 50    | 22.5  | 25  | 2.5 | |
| 20   | 50    | 25    | 20  | 5   | |
| 15   | 50    | 27.5  | 15  | 7.5 | |
| 10   | 50    | 30    | 10  | 10  | GL keeps full split |
| 5    | 50    | 35    | 5   | 10  | GL keeps full split, Savvy gets extra |

Wait — for 5% referral with GL=10:
- Agent=50, Ref=5, GL=10, Savvy=35
- Total: 50+5+10+35 = 100 ✓
- But base Savvy is 40. With 5% referral, Savvy should be 40-5=35? No...
- Base: Agent=50, GL=10, Savvy=40
- With 5% referral: the referral comes from somewhere. Total paid = 50+10+5 = 65, Savvy = 35.
- So Savvy absorbs the referral fee!

Let me re-analyze:
- For 10% referral: Agent=50, GL=10, Ref=10, Savvy=30. Base Savvy=40, so Savvy lost 10.
- For 5% referral: Agent=50, GL=10, Ref=5, Savvy=35. Base Savvy=40, so Savvy lost 5.
- For 15% referral: Agent=50, GL=7.5, Ref=15, Savvy=27.5. Base Savvy=40, so Savvy lost 12.5. GL lost 2.5.
- For 20% referral: Agent=50, GL=5, Ref=20, Savvy=25. Base Savvy=40, so Savvy lost 15. GL lost 5.
- For 25% referral: Agent=50, GL=2.5, Ref=25, Savvy=22.5. Base Savvy=40, so Savvy lost 17.5. GL lost 7.5.
- For 30% referral: Agent=50, GL=0, Ref=30, Savvy=20. Base Savvy=40, so Savvy lost 20. GL lost 10.

Pattern: Savvy always loses (referral - GL_loss). And GL + Savvy_loss = referral.
- 30: GL_loss=10, Savvy_loss=20. Total=30 ✓
- 25: GL_loss=7.5, Savvy_loss=17.5. Total=25 ✓
- 20: GL_loss=5, Savvy_loss=15. Total=20 ✓
- 15: GL_loss=2.5, Savvy_loss=12.5. Total=15 ✓
- 10: GL_loss=0, Savvy_loss=10. Total=10 ✓
- 5: GL_loss=0, Savvy_loss=5. Total=5 ✓

So the pattern is: Savvy absorbs the referral first, then when Savvy hits 20% minimum,
the group leader starts absorbing.

Savvy base = 40. Savvy min = 20. Savvy can absorb up to 20.
- If referral <= 20: Savvy absorbs all, GL keeps full split.
  - Ref=5: Savvy=35, GL=10 ✓
  - Ref=10: Savvy=30, GL=10 ✓
  - Ref=15: Savvy=25, GL=10... but Tyler says GL=7.5, Savvy=27.5 ✗

Hmm, that doesn't work either. Let me look again...

Actually, looking at the numbers more carefully:
- Ref=30: Savvy_loss=20, GL_loss=10 → ratio: 2:1
- Ref=25: Savvy_loss=17.5, GL_loss=7.5 → ratio: 2.33:1
- Ref=20: Savvy_loss=15, GL_loss=5 → ratio: 3:1
- Ref=15: Savvy_loss=12.5, GL_loss=2.5 → ratio: 5:1
- Ref=10: Savvy_loss=10, GL_loss=0 → all Savvy
- Ref=5: Savvy_loss=5, GL_loss=0 → all Savvy

The pattern: GL only starts losing when referral > GL_split (10).
When referral > 10: GL_loss = (referral - 10) / 2, Savvy_loss = referral - GL_loss

Wait: 
- Ref=15: GL_loss = (15-10)/2 = 2.5 ✓, Savvy_loss = 15-2.5 = 12.5 ✓
- Ref=20: GL_loss = (20-10)/2 = 5 ✓, Savvy_loss = 20-5 = 15 ✓
- Ref=25: GL_loss = (25-10)/2 = 7.5 ✓, Savvy_loss = 25-7.5 = 17.5 ✓
- Ref=30: GL_loss = (30-10)/2 = 10 ✓, Savvy_loss = 30-10 = 20 ✓

YES! The formula is:
- If referral <= GL_split: Savvy absorbs all. GL keeps full split.
- If referral > GL_split: 
  - excess = referral - GL_split
  - GL_loss = excess / 2
  - Savvy_loss = GL_split + excess / 2 = referral - GL_loss
  - But enforce Savvy min 20%

## Verify with GL=20% (Agent=50%, Savvy=30%, GL=20%)

| Ref% | Agent | Savvy | Ref | GL  |
|------|-------|-------|-----|-----|
| 30   | 50    | 20    | 30  | 0   |
| 25   | 50    | 22.5  | 25  | 2.5 |
| 20   | 50    | 25    | 20  | 5   |
| 15   | 50    | 27.5  | 15  | 7.5 |
| 10   | 50    | 30    | 10  | 10  |
| 5    | 50    | 30    | 5   | 15  |

Using formula: If referral <= GL_split (20): Savvy absorbs all.
- Ref=5: Savvy=30-5=25? But Tyler says Savvy=30, GL=15.
  
Hmm, that doesn't work for GL=20 either. Let me re-analyze GL=20:
- Ref=5: Agent=50, Savvy=30, Ref=5, GL=15. GL_loss=5, Savvy_loss=0.
- Ref=10: Agent=50, Savvy=30, Ref=10, GL=10. GL_loss=10, Savvy_loss=0.
- Ref=15: Agent=50, Savvy=27.5, Ref=15, GL=7.5. GL_loss=12.5, Savvy_loss=2.5.
- Ref=20: Agent=50, Savvy=25, Ref=20, GL=5. GL_loss=15, Savvy_loss=5.
- Ref=25: Agent=50, Savvy=22.5, Ref=25, GL=2.5. GL_loss=17.5, Savvy_loss=7.5.
- Ref=30: Agent=50, Savvy=20, Ref=30, GL=0. GL_loss=20, Savvy_loss=10.

For GL=20:
- If referral <= GL_split: GL absorbs all! Savvy stays at base.
  - Ref=5: GL_loss=5, GL=15, Savvy=30 ✓
  - Ref=10: GL_loss=10, GL=10, Savvy=30 ✓
  - Ref=15: GL_loss=12.5, but GL only has 20... GL_loss > 10? 
    Actually: referral > GL/2? No...

Let me try: GL absorbs first up to GL_split, then split the excess.
- Ref=5: 5 <= 20, GL absorbs all. GL=15, Savvy=30 ✓
- Ref=10: 10 <= 20, GL absorbs all. GL=10, Savvy=30 ✓
- Ref=15: 15 <= 20, GL absorbs all. GL=5, Savvy=30. But Tyler says GL=7.5, Savvy=27.5 ✗

Hmm. Let me try yet another pattern. Looking at GL=20:
- Ref=10: GL=10, Savvy=30 → GL absorbed 10
- Ref=15: GL=7.5, Savvy=27.5 → GL absorbed 12.5, Savvy absorbed 2.5
- Ref=20: GL=5, Savvy=25 → GL absorbed 15, Savvy absorbed 5

For GL=10:
- Ref=10: GL=10, Savvy=30 → GL absorbed 0, Savvy absorbed 10
- Ref=15: GL=7.5, Savvy=27.5 → GL absorbed 2.5, Savvy absorbed 12.5
- Ref=20: GL=5, Savvy=25 → GL absorbed 5, Savvy absorbed 15

INTERESTING! The GL=10 and GL=20 tables have IDENTICAL outputs for the same referral %!
Both give the exact same Agent, Savvy, Ref, GL values for each referral level.

This means the formula doesn't depend on the base GL split at all (for 10% and 20%).
The formula is purely based on the referral % with fixed outputs:

| Ref% | Agent | Savvy | GL  |
|------|-------|-------|-----|
| 30   | 50    | 20    | 0   |
| 25   | 50    | 22.5  | 2.5 |
| 20   | 50    | 25    | 5   |
| 15   | 50    | 27.5  | 7.5 |
| 10   | 50    | 30    | 10  |
| 5    | 50    | 35/30 | 10/15 |

Wait, for 5% referral they differ:
- GL=10: Agent=50, Savvy=35, Ref=5, GL=10
- GL=20: Agent=50, Savvy=30, Ref=5, GL=15

So the formula IS:
- Agent always = 50%
- Savvy minimum = 20%
- Referral = referral%
- Remaining = 100 - 50 - referral = 50 - referral
- This remaining is split between Savvy and GL
- Savvy gets: min(remaining, savvyBase) where savvyBase = 100-50-GL_split
  Actually no... let me think differently.

The rule states: "Savvy's minimum company dollar is 20%, and the agent minimum is 50%. 
If any percentage remains after company minimums are met, we split the difference."

So: Agent=50, Savvy=20 are minimums. That accounts for 70%.
Remaining = 30% to distribute between GL and additional Savvy.
But we also need to pay referral from this 30%.

Available for GL = 30 - referral
- If available >= GL_split: GL gets GL_split, Savvy gets extra (30-referral-GL_split+20)
- If available < GL_split and available >= 0: GL gets available, Savvy stays at 20
- If available < 0: GL gets 0, Savvy gets 20... but total would be < 100

Let me test: 
GL=10, Ref=5: available = 30-5 = 25. GL gets min(10, 25) = 10. Savvy = 20 + (25-10) = 35 ✓
GL=10, Ref=10: available = 30-10 = 20. GL gets min(10, 20) = 10. Savvy = 20 + (20-10) = 30 ✓
GL=10, Ref=15: available = 30-15 = 15. GL gets min(10, 15) = 10. Savvy = 20 + (15-10) = 25.
  But Tyler says GL=7.5, Savvy=27.5 ✗

Hmm. "Split the difference" — maybe it means split evenly?

After minimums (Agent=50, Savvy=20): 30% left.
Pay referral: 30 - referral left for GL.
But "split the difference" means if there's not enough for GL's full split, 
the shortfall is split between Savvy and GL?

GL=10, Ref=15: 30-15=15 left. GL wants 10. 15 >= 10, so GL=10, Savvy=20+5=25.
Still doesn't match.

OK let me try: the "remaining" after minimums and referral is split between Savvy (above minimum) and GL proportionally based on their base splits.

Base Savvy above min = savvyBase - 20. For GL=10: 40-20=20. For GL=20: 30-20=10.
Base GL = GL_split. For GL=10: 10. For GL=20: 20.

Total distributable above minimums = (savvyBase-20) + GL_split = 30 (always, since savvyBase+GL_split=50, so 50-20=30).

After referral, distributable = 30 - referral.
Savvy share = (savvyBase-20) / 30 * distributable + 20
GL share = GL_split / 30 * distributable

For GL=10, Ref=15: distributable = 15.
- Savvy = (20/30)*15 + 20 = 10 + 20 = 30. But Tyler says 27.5 ✗

Proportional doesn't work either. Let me try equal split of the shortfall.

Base: Savvy=40, GL=10 (for GL=10 group).
Referral=15. Shortfall from base = 15.
Each absorbs half: Savvy absorbs 7.5, GL absorbs 7.5.
Savvy = 40-7.5 = 32.5, GL = 10-7.5 = 2.5. But Tyler says Savvy=27.5, GL=7.5 ✗

Equal split of referral cost?
Ref=15, each pays 7.5: Savvy=40-7.5=32.5, GL=10-7.5=2.5 ✗

Let me try: Savvy absorbs up to (savvyBase - 20), then GL absorbs the rest.
GL=10: savvyBase=40. Savvy can absorb up to 20.
- Ref=5: Savvy absorbs 5, GL absorbs 0. Savvy=35, GL=10 ✓
- Ref=10: Savvy absorbs 10, GL absorbs 0. Savvy=30, GL=10 ✓
- Ref=15: Savvy absorbs 15, GL absorbs 0. Savvy=25, GL=10. Tyler says 27.5, 7.5 ✗

GL=20: savvyBase=30. Savvy can absorb up to 10.
- Ref=5: Savvy absorbs 5, GL absorbs 0. Savvy=25, GL=20. Tyler says 30, 15 ✗

None of these simple formulas work. The actual pattern from Tyler's tables is:

For GL=10: 
| Ref | Savvy | GL | Savvy_absorbed | GL_absorbed |
| 30  | 20    | 0  | 20             | 10          |
| 25  | 22.5  | 2.5| 17.5           | 7.5         |
| 20  | 25    | 5  | 15             | 5           |
| 15  | 27.5  | 7.5| 12.5           | 2.5         |
| 10  | 30    | 10 | 10             | 0           |
| 5   | 35    | 10 | 5              | 0           |

For GL=20:
| Ref | Savvy | GL | Savvy_absorbed | GL_absorbed |
| 30  | 20    | 0  | 10             | 20          |
| 25  | 22.5  | 2.5| 7.5            | 17.5        |
| 20  | 25    | 5  | 5              | 15          |
| 15  | 27.5  | 7.5| 2.5            | 12.5        |
| 10  | 30    | 10 | 0              | 10          |
| 5   | 30    | 15 | 0              | 5           |

For GL=10: GL_absorbed = max(0, (referral-10)/2 * ... no)
GL_absorbed when ref>10: (ref-10)/2. When ref<=10: 0.
- Ref=15: (15-10)/2 = 2.5 ✓
- Ref=20: (20-10)/2 = 5 ✓
- Ref=25: (25-10)/2 = 7.5 ✓
- Ref=30: (30-10)/2 = 10 ✓

For GL=20: GL_absorbed when ref>0: 
- Ref=5: 5 ✓ (just ref itself)
- Ref=10: 10 ✓
- Ref=15: 12.5. (15-0)/2 = 7.5 ✗. (15+10)/2 = 12.5 ✓!
  Wait: (ref + 10) / 2? Ref=15: (15+10)/2 = 12.5 ✓
  Ref=20: (20+10)/2 = 15 ✓
  Ref=25: (25+10)/2 = 17.5 ✓
  Ref=30: (30+10)/2 = 20 ✓
  Ref=10: (10+10)/2 = 10 ✓
  Ref=5: (5+10)/2 = 7.5 ✗ (should be 5)

Hmm. For GL=20 when ref<=10: GL absorbs all.
When ref>10: GL_absorbed = (ref+10)/2? No...

Actually: GL=20, savvyBase=30.
Savvy_absorbed = max(0, ref - GL_split) * ... 
- Ref=5: Savvy_absorbed=0, GL_absorbed=5
- Ref=10: Savvy_absorbed=0, GL_absorbed=10
- Ref=15: Savvy_absorbed=2.5, GL_absorbed=12.5
- Ref=20: Savvy_absorbed=5, GL_absorbed=15
- Ref=25: Savvy_absorbed=7.5, GL_absorbed=17.5
- Ref=30: Savvy_absorbed=10, GL_absorbed=20

Pattern for GL=20 when ref>10: Savvy_absorbed = (ref-10)/2
- Ref=15: (15-10)/2 = 2.5 ✓
- Ref=20: (20-10)/2 = 5 ✓
- Ref=25: (25-10)/2 = 7.5 ✓
- Ref=30: (30-10)/2 = 10 ✓

Same formula as GL=10! The breakpoint is always at ref=10, not at GL_split.

So the universal formula for GL=10 and GL=20 is:
- If ref <= 10: Savvy absorbs all, GL absorbs 0 (for GL=10) or GL absorbs ref (for GL=20)

Wait no. For GL=10 ref=10: Savvy=30 (absorbed 10), GL=10 (absorbed 0).
For GL=20 ref=10: Savvy=30 (absorbed 0), GL=10 (absorbed 10).

These are DIFFERENT! Let me look at this differently.

The OUTPUT is the same: Savvy=30, GL=10 for both when ref=10.
And Savvy=27.5, GL=7.5 for both when ref=15.

So the formula produces the same final Savvy and GL regardless of the base GL split (10 or 20).

The formula for the FINAL values is:
- Agent = 50 (always)
- If ref <= 10: GL = 10, Savvy = 50 - ref - 10 + 20 = 40 - ref
  Wait: GL=10 ref=5: Savvy=35, GL=10. 50-5=45, 45-10=35. Savvy = 50-ref-GL ✓
  GL=20 ref=5: Savvy=30, GL=15. 50-5=45, 45-15=30. But GL=15, not 10.

OK so the outputs are NOT identical for ref<=10. Let me re-examine.

GL=10, ref=5: Savvy=35, GL=10
GL=20, ref=5: Savvy=30, GL=15

The difference is 5 in both Savvy and GL, which is the difference in base GL (20-10=10... no, 5).

Hmm. Let me just look at the actual rule: "Savvy's minimum company dollar is 20%, 
and the agent minimum is 50%. If any percentage remains after company minimums are met, 
we split the difference."

I think "split the difference" means: after paying Agent=50%, Savvy=20%, Referral=ref%,
the remaining (30-ref)% is split evenly between Savvy (above 20%) and GL.

GL=10, ref=15: remaining = 30-15 = 15. Split evenly: 7.5 each.
Savvy = 20 + 7.5 = 27.5, GL = 7.5 ✓✓✓

GL=10, ref=10: remaining = 30-10 = 20. Split evenly: 10 each.
Savvy = 20 + 10 = 30, GL = 10 ✓✓✓

GL=10, ref=5: remaining = 30-5 = 25. Split evenly: 12.5 each.
Savvy = 20 + 12.5 = 32.5, GL = 12.5. But Tyler says Savvy=35, GL=10 ✗

So "split evenly" works for ref >= 10 but not for ref < 10.

For ref < GL_split: GL gets its full split, Savvy gets the rest.
GL=10, ref=5: remaining=25. GL gets min(10, 25)=10. Savvy=20+15=35 ✓
GL=20, ref=5: remaining=25. GL gets min(20, 25)=20. Savvy=20+5=25. Tyler says 30, 15 ✗

Hmm. GL=20, ref=5: GL=15, not 20. So GL doesn't get full split either.

GL=20, ref=5: remaining=25. Split evenly: 12.5 each. Savvy=32.5, GL=12.5. Tyler says 30, 15 ✗

Let me try: split proportionally based on base splits above minimum.
Savvy above min = savvyBase - 20. GL base = GL_split.
Total = (savvyBase-20) + GL_split = 30.

GL=10: Savvy_extra_ratio = 20/30 = 2/3, GL_ratio = 10/30 = 1/3
GL=20: Savvy_extra_ratio = 10/30 = 1/3, GL_ratio = 20/30 = 2/3

GL=10, ref=5: remaining=25. Savvy_extra = 25*2/3 = 16.67, GL = 25*1/3 = 8.33. Tyler: 15, 10 ✗

GL=20, ref=5: remaining=25. Savvy_extra = 25*1/3 = 8.33, GL = 25*2/3 = 16.67. Tyler: 10, 15 ✗

Proportional doesn't work either. Let me try a different approach.

What if the rule is: GL absorbs referral first (up to their split), then Savvy absorbs the rest,
BUT with the constraint that Savvy minimum is 20%?

GL=10, ref=5: GL absorbs 5, GL=5. Savvy=40. Tyler says GL=10, Savvy=35 ✗

What if Savvy absorbs first?
GL=10, ref=5: Savvy absorbs 5, Savvy=35. GL=10 ✓
GL=10, ref=10: Savvy absorbs 10, Savvy=30. GL=10 ✓
GL=10, ref=15: Savvy absorbs 15, Savvy=25. GL=10. Tyler says Savvy=27.5, GL=7.5 ✗
  Savvy can only absorb up to 20 (40-20=20), so Savvy absorbs 15, Savvy=25, GL=10.
  But Tyler says 27.5 and 7.5...

OK I think the key insight is in the phrase "we split the difference":
- First, enforce minimums: Agent=50, Savvy=20
- Remaining = 30
- Pay referral from remaining: 30 - ref
- If (30-ref) >= GL_split: GL gets full split, Savvy gets rest above 20
- If (30-ref) < GL_split: "split the difference" between what GL would get and what's available
  The "difference" = GL_split - (30-ref). This shortfall is split: half from GL, half from Savvy.
  GL = GL_split - difference/2 = GL_split - (GL_split - 30 + ref)/2 = (GL_split + 30 - ref)/2
  Savvy = 20 + (30-ref) - GL = 20 + (30-ref) - (GL_split + 30 - ref)/2

Let me test:
GL=10, ref=15: (30-15)=15 >= 10 → GL=10, Savvy=20+5=25. Tyler: 27.5, 7.5 ✗

That doesn't trigger the split. Let me try: the "split" always happens.

After minimums, remaining=30-ref is split between Savvy_extra and GL.
But GL is capped at GL_split, and Savvy_extra is capped at (savvyBase-20).

Equal split: each gets (30-ref)/2.
GL = min(GL_split, (30-ref)/2)
Savvy_extra = (30-ref) - GL

GL=10, ref=5: (30-5)/2 = 12.5. GL=min(10, 12.5)=10. Savvy_extra=25-10=15. Savvy=35 ✓
GL=10, ref=10: (30-10)/2 = 10. GL=min(10, 10)=10. Savvy_extra=20-10=10. Savvy=30 ✓
GL=10, ref=15: (30-15)/2 = 7.5. GL=min(10, 7.5)=7.5. Savvy_extra=15-7.5=7.5. Savvy=27.5 ✓✓✓
GL=10, ref=20: (30-20)/2 = 5. GL=min(10, 5)=5. Savvy_extra=10-5=5. Savvy=25 ✓✓✓
GL=10, ref=25: (30-25)/2 = 2.5. GL=min(10, 2.5)=2.5. Savvy_extra=5-2.5=2.5. Savvy=22.5 ✓✓✓
GL=10, ref=30: (30-30)/2 = 0. GL=0. Savvy_extra=0. Savvy=20 ✓✓✓

GL=20, ref=5: (30-5)/2 = 12.5. GL=min(20, 12.5)=12.5. Savvy_extra=25-12.5=12.5. Savvy=32.5.
  Tyler says GL=15, Savvy=30 ✗

Hmm, doesn't work for GL=20.

Wait — what if GL gets the LARGER half when there's a cap?
Or what if the split is proportional to base?

GL=10 ratio = 10/30 = 1/3, Savvy_extra ratio = 20/30 = 2/3
GL=20 ratio = 20/30 = 2/3, Savvy_extra ratio = 10/30 = 1/3

GL=20, ref=5: remaining=25. GL = 25 * 2/3 = 16.67. Tyler says 15 ✗

What about: GL gets (remaining - savvy_extra_base) if positive, else split?
savvy_extra_base = savvyBase - 20.
GL=10: savvy_extra_base = 20.
GL=20: savvy_extra_base = 10.

GL=20, ref=5: remaining=25. GL = 25 - 10 = 15. Savvy_extra = 10. Savvy = 30 ✓✓✓
GL=20, ref=10: remaining=20. GL = 20 - 10 = 10. Savvy_extra = 10. Savvy = 30 ✓✓✓
GL=20, ref=15: remaining=15. GL = 15 - 10 = 5. Savvy_extra = 10. Savvy = 30.
  Tyler says GL=7.5, Savvy=27.5 ✗

Hmm. For GL=20, ref=15: remaining=15, and Savvy_extra_base=10 > remaining... 
So when remaining < savvy_extra_base + GL_split, we need a different formula.

What if: 
- If remaining >= savvy_extra_base + GL_split: impossible (remaining max is 30, sum is always 30)
  Actually remaining = 30-ref, and savvy_extra_base + GL_split = 30. So remaining >= 30 only when ref=0.
  When ref>0, remaining < 30, so we always need the split formula.

Let me try: Savvy_extra gets min(savvy_extra_base, remaining). GL gets the rest.
But if GL > GL_split, cap GL at GL_split and give excess back to Savvy.

GL=10, ref=5: remaining=25. Savvy_extra=min(20,25)=20. GL=25-20=5. But GL_split=10, and 5<10.
  Tyler says GL=10 ✗

OK, what about: GL gets min(GL_split, remaining). Savvy gets rest.
GL=10, ref=5: GL=min(10,25)=10. Savvy_extra=15. Savvy=35 ✓
GL=10, ref=15: GL=min(10,15)=10. Savvy_extra=5. Savvy=25. Tyler: 7.5, 27.5 ✗

Still doesn't work for higher referrals. The "split the difference" must kick in.

FINAL ATTEMPT: Two-phase approach:
Phase 1: GL gets min(GL_split, remaining). Savvy gets rest.
Phase 2: If Savvy < 20, take from GL until Savvy=20 or GL=0.

GL=10, ref=5: GL=10, Savvy=35. Savvy>=20 ✓ Done.
GL=10, ref=15: GL=10, Savvy=25. Savvy>=20 ✓ Done. But Tyler says 7.5, 27.5 ✗

This gives the wrong answer. The issue is that for GL=10 with ref=15, Tyler's table
shows GL=7.5 even though GL could keep 10 (remaining=15 >= 10).

Going back to the equal split formula that worked for GL=10:
GL = min(GL_split, (30-ref)/2)
Savvy_extra = (30-ref) - GL

For GL=20, ref=5: GL = min(20, 12.5) = 12.5. Tyler says 15.

What if for GL=20 it's: GL = min(GL_split, remaining - (30-ref)/2)?
GL=20, ref=5: GL = min(20, 25-12.5) = min(20, 12.5) = 12.5 ✗

What if the split ratio depends on GL_split?
For GL=10: each gets half → GL=min(10, half), Savvy=rest
For GL=20: GL gets 2/3, Savvy gets 1/3?

GL=20, ref=5: remaining=25. GL=25*2/3=16.67 ✗ (should be 15)

GL=20, ref=5: remaining=25. GL=min(20, 25)-5=15? Where does 5 come from?
25-10(savvy_extra_base)=15. GL=15 ✓
GL=20, ref=10: remaining=20. 20-10=10. GL=10 ✓
GL=20, ref=15: remaining=15. 15-10=5. GL=5. Tyler says 7.5 ✗

Hmm. Let me try: remaining - savvy_extra_base works when remaining >= savvy_extra_base.
When remaining < savvy_extra_base, use the equal split.

GL=20, ref=15: remaining=15, savvy_extra_base=10. 15>=10, so GL=15-10=5. Tyler: 7.5 ✗

Still wrong. OK let me try the SIMPLEST possible formula by just looking at the numbers:

For GL=10 (savvy_extra_base=20):
ref=0: GL=10, SE=20
ref=5: GL=10, SE=15 → SE dropped by 5
ref=10: GL=10, SE=10 → SE dropped by 10
ref=15: GL=7.5, SE=7.5 → both dropped equally from ref=10 point
ref=20: GL=5, SE=5
ref=25: GL=2.5, SE=2.5
ref=30: GL=0, SE=0

For GL=20 (savvy_extra_base=10):
ref=0: GL=20, SE=10
ref=5: GL=15, SE=10 → GL dropped by 5
ref=10: GL=10, SE=10 → GL dropped by 10
ref=15: GL=7.5, SE=7.5 → both dropped equally from ref=10 point
ref=20: GL=5, SE=5
ref=25: GL=2.5, SE=2.5
ref=30: GL=0, SE=0

AHA! The pattern is clear now:
1. First, reduce the LARGER of (GL, Savvy_extra) until they're equal
2. Then reduce both equally

For GL=10 (GL=10, SE=20): SE is larger. Reduce SE first.
- SE drops from 20 to 10 (absorbing 10% of referral). At this point GL=SE=10.
- Then both drop equally: each drops by (ref-10)/2 for ref>10.

For GL=20 (GL=20, SE=10): GL is larger. Reduce GL first.
- GL drops from 20 to 10 (absorbing 10% of referral). At this point GL=SE=10.
- Then both drop equally: each drops by (ref-10)/2 for ref>10.

Let me verify ALL cases:

GL=10, SE=20. Difference = 10. SE absorbs first 10 of referral.
- ref=5: SE absorbs 5. GL=10, SE=15 ✓
- ref=10: SE absorbs 10. GL=10, SE=10 ✓
- ref=15: SE absorbs 10, then both absorb (15-10)/2=2.5 each. GL=7.5, SE=7.5 ✓
- ref=20: SE absorbs 10, then both absorb 5 each. GL=5, SE=5 ✓
- ref=25: SE absorbs 10, then both absorb 7.5 each. GL=2.5, SE=2.5 ✓
- ref=30: SE absorbs 10, then both absorb 10 each. GL=0, SE=0 ✓

GL=20, SE=10. Difference = 10. GL absorbs first 10 of referral.
- ref=5: GL absorbs 5. GL=15, SE=10 ✓
- ref=10: GL absorbs 10. GL=10, SE=10 ✓
- ref=15: GL absorbs 10, then both absorb 2.5 each. GL=7.5, SE=7.5 ✓
- ref=20: GL absorbs 10, then both absorb 5 each. GL=5, SE=5 ✓
- ref=25: GL absorbs 10, then both absorb 7.5 each. GL=2.5, SE=2.5 ✓
- ref=30: GL absorbs 10, then both absorb 10 each. GL=0, SE=0 ✓

PERFECT! This formula matches ALL of Tyler's tables!

Final Savvy = 20 + SE (savvy extra after absorption)
