pragma circom 2.1.6;

template RecursiveAggregate() {
    signal input fp_hash[4];
    signal input merkle_hash[4];
    signal input mev_hash[4];
    signal input quorum_hash[4];
    signal input compliance_hash[4];
    signal input gas_hash[4];
    signal output aggregate[4];

    for (var i = 0; i < 4; i++) {
        aggregate[i] <== fp_hash[i]
            + merkle_hash[i]
            + mev_hash[i]
            + quorum_hash[i]
            + compliance_hash[i]
            + gas_hash[i];
    }
}

component main {public [aggregate]} = RecursiveAggregate();
