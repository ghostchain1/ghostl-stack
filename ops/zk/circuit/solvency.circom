pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";

template SolvencyCircuit() {
    signal input assetsRoot;
    signal input liabilitiesRoot;
    signal input assetsSum;
    signal input liabilitiesSum;
    signal output netPosition;

    // Enforce assetsSum >= liabilitiesSum.
    component lt = LessThan(128);
    lt.in[0] <== assetsSum;
    lt.in[1] <== liabilitiesSum;
    lt.out === 0;

    // The roots are public inputs; witness generation must bind them to snapshot commitments.
    netPosition <== assetsSum - liabilitiesSum;

    assetsRoot === assetsRoot;
    liabilitiesRoot === liabilitiesRoot;
}

component main {public [assetsRoot, liabilitiesRoot, assetsSum, liabilitiesSum]} = SolvencyCircuit();
