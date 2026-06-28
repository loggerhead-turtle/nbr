# Age-Group Rating Normalization → a unified absolute scale

## The problem

NBR rates teams with a global Bradley-Terry model (`bt-mov-v1`; see
[`packages/ratings/src/bradleyTerry.ts`](../../packages/ratings/src/bradleyTerry.ts)).
Like all Elo/Glicko/Bradley-Terry systems it has two properties that, together,
make an **8U team and a 16U team show up with the same ~1500 rating**:

1. **It is identified only up to the connectivity of the games graph.** Strength
   is recovered from *differences* in game outcomes, anchored at a base of 1500.
   Teams in different connected components (tracked as `componentId`) are each
   anchored at 1500 independently, so their numbers are not comparable at all.
   This is a standard identifiability fact for Bradley-Terry: if the comparison
   graph is disconnected, relative strengths across components are undetermined.
2. **Within a component it measures relative, not absolute, skill.** The model
   estimates "how likely you beat the opponents you played." A dominant 8U team
   correctly earns a high number *against its 8U peers*; nothing in the model
   encodes that a 16U roster is physically more developed. Two teams worlds apart
   in absolute skill can therefore share a rating.

The goal: a **unified absolute scale** on which an average 16U team sits above an
average 8U team and **cross-age games are predicted well** — validated, not
assumed.

## How others solve cross-group comparability

Three method families, and how each maps onto NBR:

| Method | Where it's used | Mapping |
|---|---|---|
| **Age-graded standards** — an explicit "expected performance at each age" curve | WMA / USATF distance-running age-grading tables (the gold standard for cross-age comparison since 1989) | An explicit **age-group baseline curve** β — the developmental offset between brackets |
| **Bridge-game cross-scaling** — use inter-group games + strength-of-schedule to put everyone on one scale | KRACH (Bradley-Terry) cross-conference college hockey | Cross-age ("bridge") games connect the brackets; the global BT already attempts this implicitly |
| **Hierarchical / partial pooling** — a group-level effect; sparse groups shrink toward the population | Bayesian multilevel sports models (division/league effects) | An **age-group effect** with shrinkage so under-connected ages fall back to the curve instead of floating at 1500 |

Our approach (`bt-age-v1`) is the **synthesis of all three**: add an explicit
age-group baseline to the Bradley-Terry model, identify it from bridge games, and
regularize it with a monotone developmental prior (partial pooling).

## The model

Reparametrize each team's strength as

```
θ_i = β_{age(i)} + δ_i
```

- `β_{age}` — the **age-group baseline** (the developmental curve), one per bracket.
- `δ_i` — the team's **deviation within its age group**.

The win probability is unchanged: `P(home beats away) = σ(θ_home − θ_away + h)`.

### Why only bridge games move the curve

Substituting, `z = (β_home − β_away) + (δ_home − δ_away) + h`. For a **same-age**
game `β_home − β_away = 0`, so same-age games carry **zero information about the
curve** — they only pin down within-age deviations `δ`. The baseline β is
identified **exclusively by cross-age (bridge) games**. This is the KRACH insight,
and it makes the role of bridge games explicit and auditable.

### The objective

```
maximize  Σ_g w_g · logloss(y_g, σ(z_g))
          − (λ/2) Σ_i (δ_i − t_i)²                         // team shrinkage (partial pooling)
          − (λ_anchor/2) β_{youngest}²                     // one global anchor
          − (λ_curve/2) Σ_adjacent (β_{a+1} − β_a − s·gap)²  // monotone, smooth step prior
```

- `t_i = 0` for ordinary teams — δ shrinks toward the age baseline (partial
  pooling within an age). For a season-carried team `t_i = μ_i − β_{age(i)}`, so
  the **total** θ is pulled to the predecessor rating, preserving the existing
  carry-over behaviour.
- `s` (`ageStepPrior`) is the expected per-year developmental gain (θ units). The
  step prior simultaneously **smooths** the curve, encodes the **expected
  increase**, and **fills ages with no bridges** (their step defaults to `s`). It
  is driven by the admin **points-per-age-year** setting (`ageOffsetStep`,
  default **200 pts/year**); the real 8U→16U gap is large, so the prior is strong
  enough to dominate the within-age spread (a weak prior leaves a dominant 9U
  outranking an average 14U). `ageCurveLambda` is high so sparse, positively-
  selected bridge games can't compress the curve away from the prior.
- After each sweep the curve is projected to be **non-decreasing**
  (`enforceMonotone`) — see selection bias below.
- For display the whole curve is uniformly shifted so **14U ≈ 1500** (younger
  below, older above) — a pure relabel that changes no prediction or ranking.

Solved with the same damped coordinate-Newton sweeps as `bt-mov-v1`; β is fit in
the loop exactly like the per-level home advantage already is. When no age map is
supplied the whole extension is inert (β ≡ 0) and the engine is byte-for-byte the
old model.

### Honest uncertainty

A team's `rd` is widened to include the baseline's uncertainty:
`rd = SCALE · sqrt(var(δ) + var(β_age))`. Ages resting mostly on the prior (few
bridge games) therefore get an **honestly wider RD** and are more likely flagged
provisional, so the UI can caveat thin cross-age comparisons.

## The statistical trap: selection bias

Bridge games are **not random**. A young team plays up usually *because it is
strong*. Naive estimation on bridge games therefore **understates** the true age
gap, and an extreme upset could even invert the curve (a strong 8U above a weak
16U). Three mitigations are built in:

1. **Monotone projection** — the curve can never decrease with age.
2. **Step prior anchored to a plausible developmental gain** `s` — so the curve is
   sensible even where bridges are sparse or biased.
3. **Held-out cross-age validation** — we only accept the model if it actually
   predicts unseen cross-age games better (below).

If validation later shows the gap is still mis-estimated, the next step is an
explicit selection model for who-plays-up; we deliberately start with the simpler,
testable design.

## Validation protocol

All of this reuses the existing backtest harness
([`packages/ratings/src/backtest.ts`](../../packages/ratings/src/backtest.ts)).

1. **Connectivity gate** (`pnpm --filter @nbr/worker age-diagnostics`): how many
   bridge games exist, per adjacent-age pair, and what fraction of teams sit in an
   age-bridging component. If bridges are sparse the curve leans on the prior —
   acceptable, but disclosed, and it tells us how strong to set `ageCurveLambda`.
2. **Cross-age backtest** (`pnpm --filter @nbr/worker backtest`): train on earlier
   games, predict a held-out recent window, and score **separately on the
   cross-age subset**. Acceptance criterion:

   > `bt-age-v1` must lower **cross-age** log-loss/Brier vs `bt-mov-v1`, **without
   > regressing the same-age segment.**

   The worker prints an explicit `cross-age verdict` line.

## Operating it

- **`bt-age-v1` is the default model** (`DEFAULT_RATING_ALGORITHM` in
  [`packages/core/src/schemas.ts`](../../packages/core/src/schemas.ts)).
- A site admin can switch the active model from **Admin → Settings** (the
  "Rating algorithm" form). The choice is stored in the `AppSetting` key/value
  table under `ratingAlgorithm` and takes effect on the next recompute.
- The recompute resolves the model in priority order: **admin setting → the
  `RATING_ALGORITHM` env var (ad-hoc override) → the default.** The recompute log
  prints the chosen model, the age-curve prior (pts/age-year), and the fitted age
  curve with per-age bridge counts.
- The **strength of the age separation** is the admin **points-per-age-year**
  setting (Admin → Age offset; `ageOffsetStep`, default 200). The same knob drives
  this model's prior and the legacy admin cross-age preview. Raise it for a wider
  spread between ages, lower it for a gentler one; it takes effect on the next
  recompute.
- Other tunables (engine options, sensible defaults): `ageCurveLambda`,
  `ageAnchorLambda`, `enforceMonotone`. Calibrate against the cross-age backtest.
- **Note:** with `bt-age-v1` active the age step is already baked into stored
  ratings, so the legacy *Age offset* admin preview (which adds the same step on
  top of stored ratings) would double-count — read it only when a
  non-age-normalized model is active.
- No schema change is required: the setting reuses the existing `AppSetting`
  table, and ratings stay in `Rating.rating` on the same display scale.

## References

- Elo / Bradley-Terry identifiability and connectivity (relative strengths across
  disconnected components are undetermined; one parameter must be anchored).
- KRACH — "Ken's Ratings for American College Hockey," a Bradley-Terry system that
  ranks across conferences by letting cross-conference games bridge the divisions.
- WMA / USATF age-grading tables — an explicit per-age standard curve, the gold
  standard for cross-age performance comparison in distance running.
- Hierarchical / multilevel ("partial pooling") models — group-level effects whose
  estimates borrow strength across groups, shrinking sparse groups toward the
  population.
