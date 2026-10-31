/** Stable definition of the nine public suite-v1 challenge cases.
 * The server validates shared records against this same contract.
 */
export const CHALLENGE_LAYOUT = [
    ['bowl', [[-2.2, 1.8], [1.6, 2.2], [-.6, -1.8]]],
    ['ravine', [[-2.4, 1.5], [2.1, -1.3], [-2.2, -1.7]]],
    ['rosenbrock', [[-1.2, 1], [1.4, -.5], [.1, 1.5]]]
];

export const CHALLENGE_CASES = CHALLENGE_LAYOUT.flatMap(([preset, starts]) =>
    starts.map((start, i) => ({ preset, start, seed: i + 1 })));
