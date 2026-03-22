package lemansultimate

import "testing"

// TestContainerOffsets verifies that the computed container-level offset
// calculations in adapter.go match the expected values from SharedMemoryInterface.hpp.
func TestContainerOffsets(t *testing.T) {
	tests := []struct {
		name     string
		computed int
		expected int
	}{
		{
			name:     "genericBinSize",
			computed: genericBinSize,
			expected: 332,
		},
		{
			name:     "scoInfoBinSize",
			computed: scoInfoBinSize,
			expected: 548,
		},
		{
			name:     "vehScoBinSize",
			computed: vehScoBinSize,
			expected: 584,
		},
		{
			name:     "telemVehBinSize",
			computed: telemVehBinSize,
			expected: 1888,
		},
		{
			name:     "scoringStart",
			computed: scoringStart,
			expected: 332 + 1300, // genericBinSize + pathsBinSize = 1632
		},
		{
			name:     "vehScoBase",
			computed: vehScoBase,
			expected: 1632 + 548 + 12, // scoringStart + scoInfoBinSize + scoringStreamSizeHeader = 2192
		},
		{
			name:     "telemStart",
			computed: telemStart,
			expected: 2192 + 104*584 + 65536, // vehScoBase + 104*vehScoBinSize + scoringStreamSize = 128464
		},
		{
			name:     "playerIdxOffset",
			computed: playerIdxOffset,
			expected: 128464 + 1, // telemStart + 1 = 128465
		},
		{
			name:     "telemInfoBase",
			computed: telemInfoBase,
			expected: 128464 + 4, // telemStart + telemHeaderSize = 128468
		},
		{
			name:     "totalBufSize",
			computed: totalBufSize,
			expected: 128468 + 104*1888, // telemInfoBase + 104*telemVehBinSize = 324820
		},
	}

	var failed []string
	for _, tt := range tests {
		if tt.computed != tt.expected {
			failed = append(failed, tt.name)
			t.Errorf("%s: got %d, expected %d", tt.name, tt.computed, tt.expected)
		}
	}

	if len(failed) > 0 {
		t.Fatalf("offset mismatches: %v", failed)
	}
}
