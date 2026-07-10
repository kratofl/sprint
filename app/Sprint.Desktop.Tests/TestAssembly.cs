using Xunit;

// Avalonia's HeadlessUnitTestSession is process-global. Running independent UI
// classes concurrently can deadlock the shared dispatcher/render loop, so the
// desktop assembly executes deterministically while pure tests remain fast.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
