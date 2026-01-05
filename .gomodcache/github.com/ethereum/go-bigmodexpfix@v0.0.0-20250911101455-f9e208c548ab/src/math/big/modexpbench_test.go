package big

import (
	"fmt"
	"math/rand"
	"sync"
	"testing"
)

// computeModExpGasSimplfied computes the (simplified) gas cost corresponding to a ModExp-precompile call with a
// base and modulus of a given length (in bytes) and an exponents of a given length in bits.
//
// version must be either "EIP2565" or "EIP7883" to select the corresponding gas pricing function.
//
// Note that this does not 100% match the gas cost specified in the EIP. The latter may differ in case of (a large number of) leading zeros.
// The reason why this simplification is allowed here is that we only use this to benchmark the implementation of nat.expNN and creating a nat will normalize away leading zeros. Also, we don't really care about overflows.
func computeModExpGasSimplified(baseByteLength uint, modulusByteLength uint, exponentBitLenght uint, version string) uint64 {
	if modulusByteLength == 0 {
		panic("called computeModExpGasSimplified with a modulus byte length of 0") // This would correspond to an exponentiation in Z, rather than a modular exponentiation.
	}

	// maxLen := Max{baseByteLength, modulusByteLength}
	var maxLen uint = baseByteLength
	if modulusByteLength > maxLen {
		maxLen = modulusByteLength
	}
	switch version {
	case "EIP2565":
		WordLength := (maxLen + 7) / 8 // number of 64-bit words in max{modulus,base}
		MultComplexity := uint64(WordLength) * uint64(WordLength)
		var iteration_count uint64
		if exponentBitLenght <= 1 {
			iteration_count = 1
		} else {
			iteration_count = uint64(exponentBitLenght - 1) // the case distinction exponentBitLength > 32 from the EIP is not needed due to not considering leading 0s.
		}
		result := (MultComplexity * iteration_count) / 2
		if result < 200 {
			result = 200
		}
		return result

	case "EIP7883":
		WordLength := (maxLen + 7) / 8 // number of 64-bit words in max{modulus,base}
		MultComplexity := uint64(16)
		if maxLen > 32 {
			MultComplexity = 2 * uint64(WordLength) * uint64(WordLength) // strangely discontinuous formula, but that's what the EIP says.
		}
		var iteration_count uint64
		if exponentBitLenght <= 1 {
			iteration_count = 1
		} else if exponentBitLenght <= 256 {
			iteration_count = uint64(exponentBitLenght - 1)
		} else {
			iteration_count = uint64(exponentBitLenght-1) + 8*((uint64(exponentBitLenght)+7)/8-32)
		}
		result := MultComplexity * iteration_count
		if result < 500 {
			result = 500
		}
		return result

	default:
		panic(fmt.Sprintf("math/big/computeModExpGasSimplied: could not recognize version string %v. Valid inputs are \"EIP2565\" and \"EIP7883\"", version))
	}
}

// createBaseModExp creates a random triple (base, exponent, modulus) of nats with the prescribed lengths in bytes resp. bits.
// Modulus will have exactly modulus2adicity many trailing zeros among its 8*modulusByteLength many bits.
//
// Note that this functions guarantees that the byte-length / bit-length is *exactly* the requested amount by setting the appropriate highest bit to 1, unless the given length is 0.
// If modulus2adicity is >= 8*modulusByteLength, we truncate modulus2adicity to its maximum meaningful value of 8*modulusByteLength-1 instead.
// If base2Adicity is -1, it has no effect. Otherwise, we guarantee that base has exactly base2Adicity trailing 0 bits, capped at 8*baseByteLength-1.
func createBaseModExp(rand *rand.Rand, baseByteLength uint, modulusByteLength uint, exponentBitLength uint, modulus2adicity uint, base2Adicity int) (base nat, exponent nat, modulus nat) {
	// NOTE: This is (by far) not the most efficient way to create those numbers. We do not care.

	// For lengths zero, we return empty (rather than nil) slices. The nat{}.make(1) rather than nat{}.make(0) is because
	// the library does not handle those edge case well. We just call .norm() at the end.
	if modulusByteLength == 0 {
		modulus = nat{}.make(1).setWord(0).norm()
	} else {
		if modulus2adicity >= 8*modulusByteLength {
			modulus2adicity = 8*modulusByteLength - 1
		}
		// create a random number for modulus with *exactly* modulusByteLength bytes with the highest bit set.
		// we also ensure that exactly modulus2adicity least significant bits are 0, followed by a 1.
		modulusPowerOf2 := nat{}.setBit(nat{}, 8*modulusByteLength-1, 1)             // set highest bit to 1
		modulusTail := nat{}.random(rand, modulusPowerOf2, 8*int(modulusByteLength)) // set other bits randomly
		modulus = modulusTail.add(modulusTail, modulusPowerOf2)
		// set modulus2adicity many least significant bits to 0 and the next one to 1.
		for i := uint(0); i < modulus2adicity; i++ {
			modulus = modulus.setBit(modulus, i, 0)
		}
		modulus = modulus.setBit(modulus, modulus2adicity, 1)
	}

	if baseByteLength == 0 {
		base = nat{}.make(1).setWord(0).norm()
	} else {
		// set base to a random number with exactly baseByteLength many bytes, again with the highest bit forcibly set to 1.
		basePowerOf2 := nat{}.setBit(nat{}, 8*baseByteLength-1, 1)
		baseTail := nat{}.random(rand, basePowerOf2, 8*int(baseByteLength))
		base = baseTail.add(baseTail, basePowerOf2)

		if base2Adicity >= 0 {
			if uint(base2Adicity) > 8*baseByteLength {
				base2Adicity = int(8*baseByteLength - 1)
			}
			for i := uint(0); i < uint(base2Adicity); i++ {
				base = base.setBit(base, i, 0)
			}
			base = base.setBit(base, uint(base2Adicity), 1)
		}
	}

	if exponentBitLength == 0 {
		exponent = nat{}.make(1).setWord(0).norm()
	} else {
		// set exponent to a random number with exactly exponentBitLenght bits (again, msb set to 1)
		// NOTE: Using a random bit-pattern for the exponent is expected to be the worst case for a fixed-window exponentiation.
		// If we use a different exponentiation algorithm, this might no longer be true.
		exponentPowerOf2 := nat{}.setBit(nat{}, exponentBitLength-1, 1)
		exponentTail := nat{}.random(rand, exponentPowerOf2, int(exponentBitLength))
		exponent = exponentPowerOf2.add(exponentPowerOf2, exponentTail)
	}
	base = base.norm()
	exponent = exponent.norm()
	modulus = modulus.norm()
	return
}

// TestExponentiationAlgorithms runs differential tests on the various exponentiation algorithm versions we have.
// Note that base, exponent and modulus must not alias.
func testExponentiationAlgorithms(t *testing.T, base nat, exponent nat, modulus nat) {
	stk := getStack()
	defer stk.free()
	baseCopy := stk.nat(len(base))
	exponentCopy := stk.nat(len(exponent))
	modulusCopy := stk.nat(len(modulus))
	copy(baseCopy, base)
	copy(exponentCopy, exponent)
	copy(modulusCopy, modulus)

	var naiveResult nat

	// For base == 0 or exponent == 0, expNNSlow does not work.
	if len(base) == 0 { // 0 ** exponent is 0, unless exponent is also 0. In this case 0 ** 0 == 1, but we need to take into account that modulus might be 1.
		if len(modulus) == 1 && modulus[0] == 1 {
			naiveResult = naiveResult.norm()
		} else if len(exponent) == 0 {
			naiveResult = naiveResult.make(1).setWord(1).norm()
		} else {
			naiveResult = naiveResult.norm()
		}

	} else if len(exponent) == 0 { // base ** 0 == 1, unconditionally. We need to take into account that modulus might be 1.
		// len(base) == 0 - case already handled above, so can assume len(base) > 0
		if len(modulus) == 1 && modulus[0] == 1 {
			naiveResult = naiveResult.norm() // result is 0
		} else {
			naiveResult = naiveResult.make(1).setWord(1).norm()
		}
	} else if len(exponent) == 1 && exponent[0] == 1 && len(modulus) > 0 { // expNNSlow performs no modular reduction in the case of exponent 1.
		naiveResult = naiveResult.rem(stk, base, modulus)
	} else {
		naiveResult = nat{}.expNNSlow(stk, base, exponent, modulus)
		if base.cmp(baseCopy) != 0 {
			t.Fatalf("expNNSlow modifies base")
		}
		if exponent.cmp(exponentCopy) != 0 {
			t.Fatalf("expNNSlow modifies exponent")
		}
		if modulus.cmp(modulusCopy) != 0 {
			t.Fatalf("expNNSlow modifies modulus")
		}
	}

	// generic test for an exponentiation algorithm expAlg(mem_for_result, stk, base, exponent, modulus) with name funcName.
	// If allowAlias is true, will check that mem_for_result may alias base, exponent (but *not* modulus!)
	// If allowNilStack is true, will check that stk == nil works.
	checkExponentiationAlgorithm := func(expAlg func(_ nat, _ *stack, _ nat, _ nat, _ nat) nat, funcName string, allowAlias bool, allowNilStack bool) {
		expResult := expAlg(nat{}, stk, base, exponent, modulus)
		if base.cmp(baseCopy) != 0 {
			t.Fatalf("%v modifies base", funcName)
		}
		if exponent.cmp(exponentCopy) != 0 {
			t.Fatalf("%v modifies exponent", funcName)
		}
		if modulus.cmp(modulusCopy) != 0 {
			t.Fatalf("%v modifies modulus", funcName)
		}
		if expResult.cmp(naiveResult) != 0 {
			t.Fatalf("%v output does not match expNNSlow output for\nbase=%v, exponent=%v,modulus=%v\nOutput was %v\nexpNNSlow gives %v", funcName, base, exponent, modulus, expResult, naiveResult)
		}
		// check that it works with stk == nil
		if allowNilStack {
			expResult = expAlg(nat{}, nil, base, exponent, modulus)

			if base.cmp(baseCopy) != 0 {
				t.Fatalf("%v (with nil stack) modifies base", funcName)
			}
			if exponent.cmp(exponentCopy) != 0 {
				t.Fatalf("%v (with nil stack) modifies exponent", funcName)
			}
			if modulus.cmp(modulusCopy) != 0 {
				t.Fatalf("%v (with nil stack) modifies modulus", funcName)
			}
			if expResult.cmp(naiveResult) != 0 {
				t.Fatalf("%v does not work for stk==nil for\nbase=%v, exponent=%v,modulus=%v\nOutput was %v\nexpNNSlow gives %v", funcName, base, exponent, modulus, expResult, naiveResult)
			}
		}
		if allowAlias {
			expResult = expAlg(base, stk, base, exponent, modulus)
			base = stk.nat(len(baseCopy))
			copy(base, baseCopy)
			if expResult.cmp(naiveResult) != 0 {
				t.Fatalf("%v does not work for base aliasing result for\nbase=%v, exponent=%v,modulus=%v\nOutput was %v\nexpNNSlow gives %v", funcName, base, exponent, modulus, expResult, naiveResult)
			}

			expResult = expAlg(exponent, stk, base, exponent, modulus)
			exponent = stk.nat(len(exponentCopy))
			copy(exponent, exponentCopy)
			if expResult.cmp(naiveResult) != 0 {
				t.Fatalf("%v does not work for exponent aliasing result for\nbase=%v, exponent=%v,modulus=%v\nOutput was %v\nexpNNSlow gives %v", funcName, base, exponent, modulus, expResult, naiveResult)
			}
		}
	}

	if len(modulus) > 0 && len(base) > 0 && len(exponent) > 0 { // Note that modulus.isPow2() panics for modulus == 0
		if logM, ok := modulus.isPow2(); ok {
			checkExponentiationAlgorithm(func(z2 nat, stk2 *stack, base2 nat, exponent2 nat, modulus2 nat) (result2 nat) {
				return z2.expNNPowerOfTwo(stk2, base2, exponent2, logM)
			}, "expNNPowerOfTwo", false, false)
		}
	}

	if len(modulus) > 0 && len(base) > 0 && len(exponent) > 0 && base[0]&1 == 1 { // Note that modulus.isPow2() panics for modulus == 0
		if logM, ok := modulus.isPow2(); ok {
			checkExponentiationAlgorithm(func(z2 nat, stk2 *stack, base2 nat, exponent2 nat, modulus2 nat) (result2 nat) {
				return z2.expNNPowerOfTwoWindowSize4(stk2, base2, exponent2, logM)
			}, "expNNPow2WindowedSize4", false, false)
		}
	}

	if len(modulus) > 0 && len(base) > 0 && len(exponent) > 0 && base[0]&1 == 1 { // Note that modulus.isPow2() panics for modulus == 0
		if logM, ok := modulus.isPow2(); ok {
			checkExponentiationAlgorithm(func(z2 nat, stk2 *stack, base2 nat, exponent2 nat, modulus2 nat) (result2 nat) {
				return z2.expNNPowerOfTwoWindowSize2(stk2, base2, exponent2, logM)
			}, "expNNPow2WindowedSize2", false, false)
		}
	}

	if len(modulus) > 0 && modulus[0]&1 == 1 {
		checkExponentiationAlgorithm(func(z2 nat, stk2 *stack, base2 nat, exponent2 nat, modulus2 nat) (result2 nat) {
			return z2.expNNOddMontgomeryWindowSize4(stk2, base2, exponent2, modulus2)
		}, "expNNOddMontgomerySize4", false, false)

	}
	if len(modulus) > 0 && modulus[0]&1 == 1 {
		checkExponentiationAlgorithm(func(z2 nat, stk2 *stack, base2 nat, exponent2 nat, modulus2 nat) (result2 nat) {
			return z2.expNNOddMontgomeryWindowSize2(stk2, base2, exponent2, modulus2)
		}, "expNNOddMontgomerySize2", false, false)
	}

	if len(modulus) > 0 && modulus[0]&1 == 0 {
		checkExponentiationAlgorithm(func(z2 nat, stk2 *stack, base2 nat, exponent2 nat, modulus2 nat) (result2 nat) {
			return z2.expNNEven(stk2, base2, exponent2, modulus2)
		}, "expNNEven", true, false)
	}

	// We intentionally check expNN itself last.
	checkExponentiationAlgorithm(func(z2 nat, stk2 *stack, base2 nat, exponent2 nat, modulus2 nat) (result2 nat) {
		return z2.expNN(stk2, base2, exponent2, modulus2, false)
	}, "expNN", true, true)
}

// runs differential tests for our various exponentiation algorithms.
func TestExponentiationAlgorithms(t *testing.T) {
	rand := rand.New(rand.NewSource(10)) // arbitrarily de-randomized to improve reproducibility
	var modulusByteLengths []uint = make([]uint, 0)
	for i := 0; i <= 384; i += 32 {
		modulusByteLengths = append(modulusByteLengths, uint(i))
	}
	modulusByteLengths = append(modulusByteLengths, 0, 1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 31, 33, 63, 65)

	exponentBitLengths := []uint{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 24, 25, 31, 32, 33, 63, 64, 65, 72, 80, 128, 256, 257, 512, 1024, 2048, 3 * 1024}

	for _, modulusByteLength := range modulusByteLengths {
		baseByteLength := modulusByteLength
		for _, exponentBitLength := range exponentBitLengths {
			base, exponent, modulus := createBaseModExp(rand, baseByteLength, modulusByteLength, exponentBitLength, 0, -1)
			testExponentiationAlgorithms(t, base, exponent, modulus)
			base, exponent, modulus = createBaseModExp(rand, baseByteLength, modulusByteLength, exponentBitLength, 0, 0)
			testExponentiationAlgorithms(t, base, exponent, modulus)
			base, exponent, modulus = createBaseModExp(rand, baseByteLength, modulusByteLength, exponentBitLength, 0, 1)
			testExponentiationAlgorithms(t, base, exponent, modulus)
			base, exponent, modulus = createBaseModExp(rand, baseByteLength, modulusByteLength, exponentBitLength, 0, 8)
			testExponentiationAlgorithms(t, base, exponent, modulus)

			base, exponent, modulus = createBaseModExp(rand, baseByteLength, modulusByteLength, exponentBitLength, 1, -1)
			testExponentiationAlgorithms(t, base, exponent, modulus)
			base, exponent, modulus = createBaseModExp(rand, baseByteLength, modulusByteLength, exponentBitLength, 8, -1)
			testExponentiationAlgorithms(t, base, exponent, modulus)

			if modulusByteLength > 0 {
				base, exponent, modulus = createBaseModExp(rand, baseByteLength+128, modulusByteLength, exponentBitLength, 8, -1)
				testExponentiationAlgorithms(t, base, exponent, modulus)
			}

			// power-of-two moduli
			if exponentBitLength > 0 && modulusByteLength > 0 {
				base, exponent, modulus = createBaseModExp(rand, baseByteLength, modulusByteLength, exponentBitLength, 8*modulusByteLength-1, -1)
				testExponentiationAlgorithms(t, base, exponent, modulus)
			}

			// very high-2-adicity moduli
			if exponentBitLength > 0 && modulusByteLength > 0 {
				base, exponent, modulus = createBaseModExp(rand, baseByteLength, modulusByteLength, exponentBitLength, 4*modulusByteLength, -1)
				testExponentiationAlgorithms(t, base, exponent, modulus)
			}
		}
	}
}

// benchmarkNatExpNN returns a benchmarking function (intendend for use with *testing.B.Run) that runs
// a benchmark on nat.expNN with the given parameters.
//
// Notably, it calls nat.expNN to compute base^exponent modulo modulus, where
// base, exponent resp. modulus have exactly baseByteLength, modulusByteLength resp. exponentBitLength many bytes/bits.
// Note that having exactly the given number of bytes/bits means that the leading byte/bit is guaranteed to be 1.
// modulus2adicty is used to select the number of trailing 0 bits of the modulus (this is, because the exponentiation algorithm need to treat that differently).
// Selecting a modulus2adicity >= 8*modulusByteLength will set it to the maximum meaningful value instead.
//
// The returned benchmarking function records custom entries Gas/op and ns/Gas in addition to the usual ones.
// To select a gas schedule, gasScheduleVersion needs to be one of "EIP2565" or "EIP7833".
// To simplify reading out the ns/Gas value (and not just printing it), e.g. to take a maximum among multiple benchmarks, that value will also be stored in *nsPerGas, unless nsPerGas == nil.
func benchmarkNatExpNN(rand *rand.Rand, baseByteLength uint, modulusByteLength uint, exponentBitLength uint, gasScheduleVersion string, modulus2adicity uint, freshStack bool, nsPerGas *float64) func(*testing.B) {
	// Setup base, modulus and exponent of the required lengths.
	base, exponent, modulus := createBaseModExp(rand, baseByteLength, modulusByteLength, exponentBitLength, modulus2adicity, -1)

	// compute gas
	gasCost := computeModExpGasSimplified(baseByteLength, modulusByteLength, exponentBitLength, gasScheduleVersion)

	return func(b *testing.B) {
		var z nat = nat{}.set(modulus) // reserve space. We copy the modulus to reserve as much space as the modulus. Note that using nat{}.make() would have us make an assumption on the Word-size.
		for b.Loop() {
			if freshStack {
				stackPool = sync.Pool{}
			}
			z = z.expNN(nil, base, exponent, modulus, false)
		}
		b.ReportMetric(float64(gasCost), "Gas/op")
		reportedNsPerGas := float64(b.Elapsed().Nanoseconds()) / (float64(b.N) * float64(gasCost))
		if nsPerGas != nil {
			*nsPerGas = reportedNsPerGas
		}
		b.ReportMetric(reportedNsPerGas, "ns/Gas")
	}
}

// BenchmarkNatExpNN will run a set of benchmarks for nat.expNN for varying input lengths and report each of those. This is a very slow benchmark.
func BenchmarkNatExpNN(b *testing.B) {
	rnd := rand.New(rand.NewSource(100))
	var maxGas float64
	for _, freshStack := range []bool{false} {
		var freshstackStr string = ""
		if freshStack {
			freshstackStr = "-ALLOC"
		}
		for modulusByteLength := 32; modulusByteLength <= 128; modulusByteLength += 32 {
			for _, exponentBitLengh := range []uint{1, 2, 3, 4, 5, 6, 7, 8, 16, 24, 32, 40, 48, 56, 64, 96, 128, 256, 384, 512, 1024, 2048, 3 * 1024, 4 * 1024, 5 * 1024} {
				b.Run(fmt.Sprintf("Base%vBytes-Mod%vBytes-Exp%vBit-OddModulus%v", modulusByteLength, modulusByteLength, exponentBitLengh, freshstackStr),
					benchmarkNatExpNN(rnd, uint(modulusByteLength), uint(modulusByteLength), exponentBitLengh, "EIP7883", 0, freshStack, &maxGas))
				b.Run(fmt.Sprintf("Base%vBytes-Mod%vBytes-Exp%vBit-2Adicity1%v", modulusByteLength, modulusByteLength, exponentBitLengh, freshstackStr),
					benchmarkNatExpNN(rnd, uint(modulusByteLength), uint(modulusByteLength), exponentBitLengh, "EIP7883", 1, freshStack, &maxGas))
				b.Run(fmt.Sprintf("Base%vBytes-Mod%vBytes-Exp%vBit-2Adicity8%v", modulusByteLength, modulusByteLength, exponentBitLengh, freshstackStr),
					benchmarkNatExpNN(rnd, uint(modulusByteLength), uint(modulusByteLength), exponentBitLengh, "EIP7883", 8, freshStack, &maxGas))
			}
		}
	}
	//b.Run("Foo", benchmarkNatExpNN(rand, 256, 256, 1000, "EIP7883", 0, nil))
}

// Benchmark for selecting threshold for window size for Power-Of-Two algorithm
/*
func BenchmarkCompareNatExpNNPowerOfTwo(b *testing.B) {
	rnd := rand.New(rand.NewSource(99))
	var base, exponent, modulus nat

	const gasScheduleVersion = "EIP7883"

	exponentBitLengths := []uint{1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 23, 24, 25, 31, 32, 33, 63, 64, 65, 127, 128, 129}

	for modulusByteLength := uint(32); modulusByteLength <= 320; modulusByteLength += 32 {
		baseByteLength := modulusByteLength
		for _, exponentBitLength := range exponentBitLengths {
			base, exponent, modulus = createBaseModExp(rnd, baseByteLength, modulusByteLength, exponentBitLength, 8*modulusByteLength, 0)
			gasCost := computeModExpGasSimplified(baseByteLength, modulusByteLength, exponentBitLength, gasScheduleVersion)
			logM, ok := modulus.isPow2()
			if !ok {
				b.Fatalf("big: Not a power of 2")
			}
			if logM != 8*modulusByteLength {
				b.Fatalf("big: wrong power of 2")
			}

			z := nat{}

			benchWindow2 := func(b *testing.B) {
				for b.Loop() {
					stk := getStack()
					z = z.expNNPowerOfTwoWindowSize2(stk, base, exponent, 8*modulusByteLength)
					stk.free()
				}
				b.ReportMetric(float64(gasCost), "Gas/op")
				reportedNsPerGas := float64(b.Elapsed().Nanoseconds()) / (float64(b.N) * float64(gasCost))
				b.ReportMetric(reportedNsPerGas, "ns/Gas")
			}
			b.Run(fmt.Sprintf("Base%vBytes-Mod%vBytes-Exp%vBits-Pow2-Window2", baseByteLength, modulusByteLength, exponentBitLength), benchWindow2)

			benchWindow4 := func(b *testing.B) {
				for b.Loop() {
					stk := getStack()
					z = z.expNNPowerOfTwoWindowSize4(stk, base, exponent, 8*modulusByteLength)
					stk.free()
				}
				b.ReportMetric(float64(gasCost), "Gas/op")
				reportedNsPerGas := float64(b.Elapsed().Nanoseconds()) / (float64(b.N) * float64(gasCost))
				b.ReportMetric(reportedNsPerGas, "ns/Gas")
			}
			b.Run(fmt.Sprintf("Base%vBytes-Mod%vBytes-Exp%vBits-Pow2-Window4", baseByteLength, modulusByteLength, exponentBitLength), benchWindow4)
		}
		// Note: We don't compare against the naive algorith; for powers of 2, the naive algorithm is not competitive.
		// (We would need an unwindowed algorithm that performs trunc instead of mod as a baseline)
	}
}
*/

// Benchmark for selecting threshold for window size for algorithm for odd modulus
/*
func BenchmarkCompareNatExpNNOdd(b *testing.B) {
	rnd := rand.New(rand.NewSource(99))
	var base, exponent, modulus nat

	const gasScheduleVersion = "EIP7883"

	exponentBitLengths := []uint{1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 23, 24, 25, 31, 32, 33, 48, 56, 63, 64, 65, 127, 128, 129, 256}

	for modulusByteLength := uint(32); modulusByteLength <= 128; modulusByteLength += 32 {
		baseByteLength := modulusByteLength
		for _, exponentBitLength := range exponentBitLengths {
			base, exponent, modulus = createBaseModExp(rnd, baseByteLength, modulusByteLength, exponentBitLength, 0, -1)
			gasCost := computeModExpGasSimplified(baseByteLength, modulusByteLength, exponentBitLength, gasScheduleVersion)

			z := nat{}

			benchWindow2 := func(b *testing.B) {
				for b.Loop() {
					stk := getStack()
					z = z.expNNOddMontgomeryWindowSize2(stk, base, exponent, modulus)
					stk.free()
				}
				b.ReportMetric(float64(gasCost), "Gas/op")
				reportedNsPerGas := float64(b.Elapsed().Nanoseconds()) / (float64(b.N) * float64(gasCost))
				b.ReportMetric(reportedNsPerGas, "ns/Gas")
			}
			b.Run(fmt.Sprintf("Base%vBytes-Mod%vBytes-Exp%vBits-Odd-Window2", baseByteLength, modulusByteLength, exponentBitLength), benchWindow2)

			benchWindow4 := func(b *testing.B) {
				for b.Loop() {
					stk := getStack()
					z = z.expNNOddMontgomeryWindowSize4(stk, base, exponent, modulus)
					stk.free()
				}
				b.ReportMetric(float64(gasCost), "Gas/op")
				reportedNsPerGas := float64(b.Elapsed().Nanoseconds()) / (float64(b.N) * float64(gasCost))
				b.ReportMetric(reportedNsPerGas, "ns/Gas")
			}
			b.Run(fmt.Sprintf("Base%vBytes-Mod%vBytes-Exp%vBits-Odd-Window4", baseByteLength, modulusByteLength, exponentBitLength), benchWindow4)

			benchSlow := func(b *testing.B) {
				for b.Loop() {
					stk := getStack()
					z = z.expNNSlow(stk, base, exponent, modulus)
					stk.free()
				}
				b.ReportMetric(float64(gasCost), "Gas/op")
				reportedNsPerGas := float64(b.Elapsed().Nanoseconds()) / (float64(b.N) * float64(gasCost))
				b.ReportMetric(reportedNsPerGas, "ns/Gas")
			}
			b.Run(fmt.Sprintf("Base%vBytes-Mod%vBytes-Exp%vBits-Odd-Slow", baseByteLength, modulusByteLength, exponentBitLength), benchSlow)

		}
	}
}
*/

func TestInverseModPowerOfTwo(t *testing.T) {
	rnd := rand.New(rand.NewSource(99))
	stk := getStack()
	defer stk.free()
	for n := 1; n <= 1024; n++ {
		powerOfTwo := nat(nil).lsh(nat{1}, uint(n))
		xs := []nat{nat{1}, nat{3}, nat{1, 1}, nat{0x12345}, nat{0x12345, 12345}}
		randomX := nat(nil).random(rnd, powerOfTwo, n+1)
		randomX.setBit(randomX, 0, 1)
		xs = append(xs, randomX)
		randomXSquared := nat(nil).sqr(stk, randomX)
		xs = append(xs, randomXSquared)
		for _, x := range xs {
			// Note that we assume result1 to be correct. But we check it, just in case.
			result1 := nat(nil).make(n/_W + 1)
			result1 = result1.modInverse(x, powerOfTwo)
			check := nat(nil).mul(stk, result1, x)
			check = check.trunc(check, uint(n))
			if check.cmp(nat{1}) != 0 {
				t.Fatalf("Error computing modular inverse of %v modulo 2**%v. Result was %v", x, n, result1)
			}
			result2 := nat(nil).modularInverseModPowerOfTwo(stk, x, uint(n))
			if result1.cmp(result2) != 0 {
				t.Fatalf("Error computing modular inverse of %v modulo 2**%v, result should be %v, but was %v", x, n, result1, result2)
			}
		}
	}
}
