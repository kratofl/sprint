package lemansultimate

// This file mirrors the LMU shared memory binary layout as Go structs.
//
//   Le Mans Ultimate\Support\SharedMemoryInterface\InternalsPlugin.hpp
//   Le Mans Ultimate\Support\SharedMemoryInterface\SharedMemoryInterface.hpp
//
// All Python ctypes structs use _pack_ = 4.  encoding/binary.Read reads struct
// fields sequentially without inserting alignment padding, so it handles pack=4
// layouts correctly — no unsafe casts or manual byte offsets required.
//
// Type mapping from Python ctypes → Go:
//   c_double  → float64   c_float   → float32
//   c_int     → int32     c_uint    → uint32
//   c_short   → int16     c_ushort  → uint16
//   c_byte    → int8      c_ubyte   → uint8
//   c_char    → byte      c_bool    → bool
//   c_ulonglong → uint64
//   c_char*N  → [N]byte   c_ubyte*N → [N]uint8   c_double*N → [N]float64

import "bytes"

const (
	lmuShmName     = "LMU_Data"
	lmuMaxVehicles = 104
)

// nullString converts a null-terminated byte slice to a Go string.
func nullString(b []byte) string {
	if i := bytes.IndexByte(b, 0); i >= 0 {
		return string(b[:i])
	}
	return string(b)
}

// lmuVect3 mirrors TelemVect3 from InternalsPlugin.hpp.
// Binary size: 24 bytes (3 × float64).
type lmuVect3 struct {
	X float64
	Y float64
	Z float64
}

// lmuWheel mirrors TelemWheelV01 from InternalsPlugin.hpp.
// Binary size: 260 bytes.
type lmuWheel struct {
	MSuspensionDeflection      float64 // metres
	MRideHeight                float64 // metres
	MSuspForce                 float64 // pushrod load in Newtons
	MBrakeTemp                 float64 // Celsius
	MBrakePressure             float64 // 0.0–1.0
	MRotation                  float64 // radians/sec
	MLateralPatchVel           float64 // lateral velocity at contact patch
	MLongitudinalPatchVel      float64 // longitudinal velocity at contact patch
	MLateralGroundVel          float64
	MLongitudinalGroundVel     float64
	MCamber                    float64    // radians
	MLateralForce              float64    // Newtons
	MLongitudinalForce         float64    // Newtons
	MTireLoad                  float64    // Newtons
	MGripFract                 float64    // fraction of contact patch sliding
	MPressure                  float64    // kPa
	MTemperature               [3]float64 // Kelvin: left/centre/right
	MWear                      float64    // 0.0–1.0
	MTerrainName               [16]byte
	MSurfaceType               uint8 // 0=dry 1=wet 2=grass 3=dirt 4=gravel 5=rumble 6=special
	MFlat                      bool
	MDetached                  bool
	MStaticUndeflectedRadius   uint8 // centimetres
	MVerticalTireDeflection    float64
	MWheelYLocation            float64
	MToe                       float64
	MTireCarcassTemperature    float64    // Kelvin
	MTireInnerLayerTemperature [3]float64 // Kelvin
	MOptimalTemp               float32    // optimal tyre temperature
	MCompoundIndex             uint8      // compound index within brand
	MCompoundType              uint8      // compound type category
	MExpansion                 [18]uint8
}

// lmuVehicleTelemetry mirrors TelemInfoV01 from InternalsPlugin.hpp.
// Binary size: 1888 bytes.
type lmuVehicleTelemetry struct {
	MID                            int32
	MDeltaTime                     float64 // seconds since last update
	MElapsedTime                   float64 // game session time
	MLapNumber                     int32
	MLapStartET                    float64 // time this lap was started
	MVehicleName                   [64]byte
	MTrackName                     [64]byte
	MPos                           lmuVect3    // world position in metres
	MLocalVel                      lmuVect3    // velocity in local vehicle coordinates (m/s)
	MLocalAccel                    lmuVect3    // acceleration in local vehicle coordinates
	MOri                           [3]lmuVect3 // orientation matrix rows
	MLocalRot                      lmuVect3    // rotation in local coordinates (rad/s)
	MLocalRotAccel                 lmuVect3    // rotational acceleration
	MGear                          int32       // -1=reverse 0=neutral 1+=forward
	MEngineRPM                     float64
	MEngineWaterTemp               float64 // Celsius
	MEngineOilTemp                 float64 // Celsius
	MClutchRPM                     float64
	MUnfilteredThrottle            float64 // 0.0–1.0
	MUnfilteredBrake               float64 // 0.0–1.0
	MUnfilteredSteering            float64 // -1.0–1.0
	MUnfilteredClutch              float64 // 0.0–1.0
	MFilteredThrottle              float64 // 0.0–1.0
	MFilteredBrake                 float64 // 0.0–1.0
	MFilteredSteering              float64 // -1.0–1.0
	MFilteredClutch                float64 // 0.0–1.0
	MSteeringShaftTorque           float64
	MFront3rdDeflection            float64
	MRear3rdDeflection             float64
	MFrontWingHeight               float64
	MFrontRideHeight               float64
	MRearRideHeight                float64
	MDrag                          float64
	MFrontDownforce                float64
	MRearDownforce                 float64
	MFuel                          float64 // litres remaining
	MEngineMaxRPM                  float64 // rev limit
	MScheduledStops                uint8
	MOverheating                   bool
	MDetached                      bool
	MHeadlights                    bool
	MDentSeverity                  [8]uint8
	MLastImpactET                  float64
	MLastImpactMagnitude           float64
	MLastImpactPos                 lmuVect3
	MEngineTorque                  float64
	MCurrentSector                 int32 // 0-based; sign bit set when in pitlane
	MSpeedLimiter                  uint8
	MMaxGears                      uint8
	MFrontTireCompoundIndex        uint8
	MRearTireCompoundIndex         uint8
	MFuelCapacity                  float64
	MFrontFlapActivated            uint8
	MRearFlapActivated             uint8
	MRearFlapLegalStatus           uint8 // 0=disallowed 1=pending 2=allowed
	MIgnitionStarter               uint8 // 0=off 1=ignition 2=ignition+starter
	MFrontTireCompoundName         [18]byte
	MRearTireCompoundName          [18]byte
	MSpeedLimiterAvailable         uint8
	MAntiStallActivated            uint8
	MUnused                        [2]uint8
	MVisualSteeringWheelRange      float32
	MRearBrakeBias                 float64
	MTurboBoostPressure            float64
	MPhysicsToGraphicsOffset       [3]float32
	MPhysicalSteeringWheelRange    float32
	MDeltaBest                     float64
	MBatteryChargeFraction         float64
	MElectricBoostMotorTorque      float64
	MElectricBoostMotorRPM         float64
	MElectricBoostMotorTemperature float64
	MElectricBoostWaterTemperature float64
	MElectricBoostMotorState       uint8
	MLapInvalidated                bool // lap invalidated by game
	MABSActive                     bool // ABS currently intervening
	MTCActive                      bool // TC currently intervening
	MSpeedLimiterActive            bool // pit lane speed limiter active
	MWiperState                    uint8
	MTC                            uint8 // TC setting (0 = off)
	MTCMax                         uint8 // max TC setting for this car
	MTCSlip                        uint8
	MTCSlipMax                     uint8
	MTCCut                         uint8
	MTCCutMax                      uint8
	MABS                           uint8 // ABS setting (0 = off)
	MABSMax                        uint8 // max ABS setting for this car
	MMotorMap                      uint8
	MMotorMapMax                   uint8
	MMigration                     uint8
	MMigrationMax                  uint8
	MFrontAntiSway                 uint8
	MFrontAntiSwayMax              uint8
	MRearAntiSway                  uint8
	MRearAntiSwayMax               uint8
	MLiftAndCoastProgress          uint8
	MTrackLimitsSteps              uint8   // normalized track limit penalty points
	MRegen                         float32 // regen power in kW
	MSoC                           float32 // ERS state of charge
	MVirtualEnergy                 float32
	MTimeGapCarAhead               float32 // time gap to car directly ahead (s)
	MTimeGapCarBehind              float32 // time gap to car directly behind (s)
	MTimeGapPlaceAhead             float32 // time gap to next place ahead (s)
	MTimeGapPlaceBehind            float32 // time gap to next place behind (s)
	MVehicleModel                  [30]byte
	MVehicleClass                  uint8 // IP_VehicleClass enum (0=Hypercar, 2=LMP2_ELMS, 5=GT3…)
	MVehicleChampionship           uint8 // IP_VehicleChampionship enum (0=WEC_2023…)
	MExpansion                     [20]uint8
	MWheels                        [4]lmuWheel
}

// lmuVehicleScoring mirrors VehicleScoringInfoV01 from InternalsPlugin.hpp.
// Binary size: 584 bytes.
type lmuVehicleScoring struct {
	MID               int32
	MDriverName       [32]byte
	MVehicleName      [64]byte
	MTotalLaps        int16
	MSector           int8    // 0=sector3, 1=sector1, 2=sector2 (quirky game ordering)
	MFinishStatus     int8    // 0=none 1=finished 2=dnf 3=dq
	MLapDist          float64 // current distance around track in metres
	MPathLateral      float64
	MTrackEdge        float64
	MBestSector1      float64
	MBestSector2      float64 // cumulative (S1+S2)
	MBestLapTime      float64
	MLastSector1      float64
	MLastSector2      float64 // cumulative
	MLastLapTime      float64
	MCurSector1       float64
	MCurSector2       float64
	MNumPitstops      int16
	MNumPenalties     int16
	MIsPlayer         bool
	MControl          int8  // -1=nobody 0=local player 1=local AI 2=remote 3=replay
	MInPits           bool  // between pit entrance and exit
	MPlace            uint8 // 1-based race position
	MVehicleClass     [32]byte
	MTimeBehindNext   float64
	MLapsBehindNext   int32
	MTimeBehindLeader float64
	MLapsBehindLeader int32
	MLapStartET       float64
	MPos              lmuVect3
	MLocalVel         lmuVect3
	MLocalAccel       lmuVect3
	MOri              [3]lmuVect3
	MLocalRot         lmuVect3
	MLocalRotAccel    lmuVect3
	MHeadlights       uint8
	MPitState         uint8 // 0=none 1=requested 2=entering 3=stopped 4=exiting
	MServerScored     uint8
	MIndividualPhase  uint8
	MQualification    int32
	MTimeIntoLap      float64
	MEstimatedLapTime float64
	MPitGroup         [24]byte
	MFlag             uint8
	MUnderYellow      bool
	MCountLapFlag     uint8 // 0=don't count 1=count lap not time 2=count lap and time
	MInGarageStall    bool
	MUpgradePack      [16]uint8
	MPitLapDist       float32
	MBestLapSector1   float32
	MBestLapSector2   float32
	MSteamID          uint64
	MVehFilename      [32]byte
	MAttackMode       int16
	MFuelFraction     uint8 // 0x00=0% 0xFF=100%
	MDRSState         bool
	MExpansion        [4]uint8
}

// lmuScoringInfo mirrors ScoringInfoV01 from InternalsPlugin.hpp.
// Binary size: 548 bytes.
type lmuScoringInfo struct {
	MTrackName            [64]byte
	MSession              int32 // 0=testday 1-4=practice 5-8=qualifying 9=warmup 10-13=race
	MCurrentET            float64
	MEndET                float64
	MMaxLaps              int32
	MLapDist              float64 // total track distance in metres
	MResultsStreamPointer [8]uint8
	MNumVehicles          int32
	// Game phases: 0=before session 1=recon laps 2=grid walkthrough 3=formation
	// 4=start lights 5=green flag 6=FCY/SC 7=stopped 8=over 9=paused
	MGamePhase uint8
	// Yellow flag states: -1=invalid 0=none 1=pending 2=pits closed 3=pit lead
	// 4=pits open 5=last lap 6=resume 7=race halt
	MYellowFlagState     int8
	MSectorFlag          [3]uint8 // local yellows per sector (0=clear, 1=yellow)
	MStartLight          uint8
	MNumRedLights        uint8
	MInRealtime          bool
	MPlayerName          [32]byte
	MPlrFileName         [64]byte
	MDarkCloud           float64
	MRaining             float64 // 0.0–1.0
	MAmbientTemp         float64 // Celsius
	MTrackTemp           float64 // Celsius
	MWind                lmuVect3
	MMinPathWetness      float64
	MMaxPathWetness      float64
	MGameMode            uint8
	MIsPasswordProtected bool
	MServerPort          uint16
	MServerPublicIP      uint32
	MMaxPlayers          int32
	MServerName          [32]byte
	MStartET             float32
	MAvgPathWetness      float64
	MExpansion           [200]uint8
	MVehiclePointer      [8]uint8
}

// lmuEvent mirrors SharedMemoryEvent from SharedMemoryInterface.hpp.
// Each field is a uint32 counter that increments each time the event fires.
// Binary size: 64 bytes (16 × uint32).
type lmuEvent struct {
	SMEEnter             uint32
	SMEExit              uint32
	SMEStartup           uint32
	SMEShutdown          uint32
	SMELoad              uint32
	SMEUnload            uint32
	SMEStartSession      uint32
	SMEEndSession        uint32
	SMEEnterRealtime     uint32
	SMEExitRealtime      uint32
	SMEUpdateScoring     uint32
	SMEUpdateTelemetry   uint32
	SMEInitApplication   uint32
	SMEUninitApplication uint32
	SMESetEnvironment    uint32
	SMEFFB               uint32
}

// lmuApplicationState mirrors ApplicationStateV01 from InternalsPlugin.hpp.
// Binary size: 260 bytes.
type lmuApplicationState struct {
	MAppWindow       uint64 // HWND
	MWidth           uint32
	MHeight          uint32
	MRefreshRate     uint32
	MWindowed        uint32
	MOptionsLocation uint8
	MOptionsPage     [31]byte
	MExpansion       [204]uint8
}

// lmuGeneric mirrors SharedMemoryGeneric from SharedMemoryInterface.hpp.
// Binary size: 332 bytes.
type lmuGeneric struct {
	Events      lmuEvent
	GameVersion int32
	FFBTorque   float32
	AppInfo     lmuApplicationState
}

// lmuPathData mirrors SharedMemoryPathData from SharedMemoryInterface.hpp.
// Binary size: 1300 bytes.
type lmuPathData struct {
	UserData        [260]byte
	CustomVariables [260]byte
	StewardResults  [260]byte
	PlayerProfile   [260]byte
	PluginsFolder   [260]byte
}
