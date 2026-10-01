export type FixtureSelection = {
  firstPairA: string;
  firstPairB: string;
  secondPairA: string;
  secondPairB: string;
  useSecondPair: boolean;
};

// Ordinary settings edits must not replace the saved fixture order. Only an
// explicit change to the pair controls asks the scheduler to rebuild it.
export function fixtureSelectionChanged(
  selected: FixtureSelection,
  seeded: FixtureSelection,
) {
  return (
    selected.firstPairA !== seeded.firstPairA ||
    selected.firstPairB !== seeded.firstPairB ||
    selected.useSecondPair !== seeded.useSecondPair ||
    (selected.useSecondPair &&
      (selected.secondPairA !== seeded.secondPairA ||
        selected.secondPairB !== seeded.secondPairB))
  );
}
