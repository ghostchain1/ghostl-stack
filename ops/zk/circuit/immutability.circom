pragma circom 2.1.6;

template EqArray(n) {
    signal input a[n];
    signal input b[n];
    for (var i = 0; i < n; i++) {
        a[i] === b[i];
    }
}

template Immutability() {
    signal input fp_pre[4];
    signal input fp_post[4];
    signal input merkle_pre[4];
    signal input merkle_post[4];
    signal input gas_pre[4];
    signal input gas_post[4];

    component eq1 = EqArray(4);
    component eq2 = EqArray(4);
    component eq3 = EqArray(4);

    for (var i = 0; i < 4; i++) {
        eq1.a[i] <== fp_pre[i];
        eq1.b[i] <== fp_post[i];
        eq2.a[i] <== merkle_pre[i];
        eq2.b[i] <== merkle_post[i];
        eq3.a[i] <== gas_pre[i];
        eq3.b[i] <== gas_post[i];
    }
}

component main = Immutability();
