// Renders dashes and parity cases with the Rust renderer, to check a rendering change by eye.
//
//   cargo run --release --example render -- --dash <layout.json> <out.png> [--page <id>] [--style panels|grid|bars] [--size 800x480]
//   cargo run --release --example render -- <case.json> <out.png>
//   cargo run --release --example render -- --all <cases-dir> <out-dir> [name-filter]
//   cargo run --release --example render -- --bench <case.json> [iterations]
//   cargo run --release --example render -- --ops <case.json>   (prints the display list)
//
// --dash draws one page of a dash layout (a preset such as app/Sprint.Desktop.Host/presets/dash/
// default.json) against the fixed race frame below; --style overrides the layout's own style, so
// one layout can be checked in every style.
//
// A case is `{ name, width, height, layout, pageId?, idle?, settings?, targets?, frame, banner?,
// nowMs }`: its scene fields go to `set_scene` as they are (the scene parser ignores the rest),
// the frame and banner to `render_still`. Its frame must be in the host's shape, as every frame
// the renderer reads; a case written with an `@sprint/types` frame is converted with
// `toHostFrame` (packages/dashboard/src/hostFrame.ts) first.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde_json::{Value, json};
use sprint_dash::Renderer;

struct Case {
    scene: Vec<u8>,
    frame: Vec<u8>,
    banner: Option<Vec<u8>>,
    now_ms: f64,
}

fn load(path: &Path) -> Result<Case, String> {
    let text = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let value: Value = serde_json::from_slice(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    let field = |key: &str| value.get(key).filter(|v| !v.is_null()).map(|v| v.to_string().into_bytes());
    Ok(Case {
        scene: text,
        frame: field("frame").unwrap_or_default(),
        banner: field("banner"),
        now_ms: value.get("nowMs").and_then(Value::as_f64).unwrap_or(0.0),
    })
}

fn render(renderer: &mut Renderer, case: &Case) -> Result<(), String> {
    renderer.set_scene(&case.scene).map_err(|e| e.to_string())?;
    renderer.render_still(&case.frame, case.banner.as_deref(), case.now_ms).map_err(|e| e.to_string())?;
    Ok(())
}

/// Writes the renderer's premultiplied pixels as a straight-alpha PNG.
fn write_png(renderer: &Renderer, out: &Path) -> Result<(), String> {
    let (width, height) = renderer.size_px();
    let mut data = renderer.pixels().to_vec();
    for px in data.as_chunks_mut::<4>().0 {
        let a = u32::from(px[3]);
        if a != 0 && a != 255 {
            for c in &mut px[..3] {
                *c = ((u32::from(*c) * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
    let file = fs::File::create(out).map_err(|e| format!("{}: {e}", out.display()))?;
    let mut encoder = png::Encoder::new(std::io::BufWriter::new(file), width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&data).map_err(|e| e.to_string())
}

fn render_one(case_path: &Path, out: &Path) -> Result<(), String> {
    let case = load(case_path)?;
    let mut renderer = Renderer::new();
    render(&mut renderer, &case)?;
    write_png(&renderer, out)
}

/// A mid-race lap at Le Mans, as the host serializes it: every widget has a value to show.
fn sample_frame() -> Value {
    let tire = |position: &str, t: f64, p: f64| {
        json!({ "position": position, "tempInnerCelsius": t + 6.0, "tempMiddleCelsius": t, "tempOuterCelsius": t - 4.0, "tempSurfaceCelsius": t,
                "tempCoreCelsius": t - 2.0, "pressureKPa": p, "wearPercent": 4, "compound": "M" })
    };
    json!({
        "timestamp": "2026-06-14T15:02:00+00:00",
        "session": { "game": "LMU", "track": "Circuit de la Sarthe", "trackLengthMeters": 13626, "car": "Porsche 963", "carClass": "Hypercar", "sessionType": "Race",
                     "sessionTime": 3720, "totalSessionTime": 21600, "sessionTimeRemaining": 17880, "bestLapTime": 208.44, "maxLaps": 0, "inCar": true },
        "car": { "speedMetersPerSecond": 78.3, "gear": 6, "rpm": 7450, "maxRpm": 9000, "throttle": 0.92, "brake": 0, "clutch": 0, "steering": -0.12,
                 "fuelLiters": 62.4, "fuelPerLapLiters": 4.6, "positionX": 0, "positionY": 0, "positionZ": 0, "brakeBiasRear": 0.462,
                 "inGarage": null, "inPitLane": null, "pitState": null, "pitLimiter": null },
        "tires": [tire("FrontLeft", 88.0, 172.0), tire("FrontRight", 94.0, 174.0), tire("RearLeft", 91.0, 168.0), tire("RearRight", 97.0, 170.0)],
        "lap": { "currentLap": 14, "currentLapTime": 92.345, "lastLapTime": 210.117, "bestLapTime": 208.44, "targetLapTime": 209.0, "delta": -0.412,
                 "sector": 2, "lastLapSectorsSeconds": [68.2, 71.9, 70.0], "isValid": true, "trackPosition": 0.44 },
        "flags": { "yellow": false, "doubleYellow": false, "red": false, "safetyCar": false, "virtualSafetyCar": false, "checkered": false },
        "electronics": { "tractionControlActive": true, "tractionControl": 4, "tractionControlMax": 9, "tractionControlSlip": 2, "tractionControlSlipMax": 9,
                         "tractionControlCut": 3, "tractionControlCutMax": 9, "abs": 3, "absMax": 9, "motorMap": 5, "motorMapMax": 9, "migration": 0,
                         "migrationMax": 0, "frontAntiRollBar": 0, "frontAntiRollBarMax": 0, "rearAntiRollBar": 0, "rearAntiRollBarMax": 0, "drsActive": false },
        "race": { "position": 4, "totalPositions": 38, "gapAhead": 2.41, "gapBehind": 5.08 },
        "energy": { "virtualEnergy": 61.2, "virtualEnergyPerLap": 4.4, "stateOfCharge": 0.58, "regenPower": 120, "deployPower": 340 },
        "penalties": { "incidents": 1, "trackLimitSteps": 0, "pitStops": 2 },
        "conditions": { "pathWetness": null, "trackGripLevel": null, "fuelMultiplier": null, "tireMultiplier": null, "fixedSetup": null },
        "field": null,
    })
}

/// `--dash`: one page of a layout file against the sample frame, with fixed lap and fuel targets.
fn render_dash(layout_path: &Path, out: &Path, options: &[&str]) -> Result<(), String> {
    let text = fs::read(layout_path).map_err(|e| format!("{}: {e}", layout_path.display()))?;
    let mut layout: Value = serde_json::from_slice(&text).map_err(|e| format!("{}: {e}", layout_path.display()))?;
    let (mut page_id, mut width, mut height) = (None, 800.0, 480.0);
    for pair in options.chunks(2) {
        match pair {
            ["--page", id] => page_id = Some(*id),
            ["--style", style @ ("panels" | "grid" | "bars")] => {
                layout.as_object_mut().ok_or("the layout is not a JSON object")?.insert("dashStyle".to_owned(), json!(style));
            }
            ["--size", size] => {
                let parsed = size.split_once('x').and_then(|(w, h)| Some((w.parse().ok()?, h.parse().ok()?)));
                (width, height) = parsed.ok_or_else(|| format!("not a size: {size} (expected e.g. 800x480)"))?;
            }
            _ => return Err(format!("unknown option: {}", pair.join(" "))),
        }
    }
    let scene =
        json!({ "layout": layout, "width": width, "height": height, "pageId": page_id, "targets": { "lapTimeSeconds": 209, "fuelPerLapLiters": 4.42 } });
    let case = Case { scene: scene.to_string().into_bytes(), frame: sample_frame().to_string().into_bytes(), banner: None, now_ms: 0.0 };
    let mut renderer = Renderer::new();
    render(&mut renderer, &case)?;
    write_png(&renderer, out)
}

fn render_all(cases: &Path, out_dir: &Path, filter: &str) -> Result<(), String> {
    fs::create_dir_all(out_dir).map_err(|e| format!("{}: {e}", out_dir.display()))?;
    let mut paths: Vec<PathBuf> = fs::read_dir(cases)
        .map_err(|e| format!("{}: {e}", cases.display()))?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "json") && p.file_stem().is_some_and(|s| s.to_string_lossy().contains(filter)))
        .collect();
    paths.sort();
    let mut renderer = Renderer::new();
    let (mut ok, mut failed) = (0, 0);
    for path in &paths {
        let name = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let result = load(path).and_then(|case| render(&mut renderer, &case)).and_then(|()| write_png(&renderer, &out_dir.join(format!("{name}.png"))));
        match result {
            Ok(()) => ok += 1,
            Err(e) => {
                failed += 1;
                eprintln!("FAILED {name}: {e}");
            }
        }
    }
    println!("rendered {ok}, failed {failed}");
    Ok(())
}

fn bench(case_path: &Path, iterations: usize) -> Result<(), String> {
    let case = load(case_path)?;
    let mut renderer = Renderer::new();
    render(&mut renderer, &case)?;
    // Warm-up: shaping and outline caches, branch predictors.
    for _ in 0..50 {
        renderer.render_still(&case.frame, case.banner.as_deref(), case.now_ms).map_err(|e| e.to_string())?;
    }
    let mut times = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let start = Instant::now();
        renderer.render_still(&case.frame, case.banner.as_deref(), case.now_ms).map_err(|e| e.to_string())?;
        times.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(f64::total_cmp);
    let mean = times.iter().sum::<f64>() / times.len() as f64;
    let at = |q: f64| times[((times.len() as f64 * q) as usize).min(times.len() - 1)];
    let (w, h) = renderer.size_px();
    println!("{}: {iterations} frames at {w}x{h} px", case_path.display());
    println!("mean {mean:.3} ms, p50 {:.3} ms, p99 {:.3} ms, max {:.3} ms", at(0.5), at(0.99), times[times.len() - 1]);
    println!("display list: {} ops", renderer.display_list().len());
    Ok(())
}

fn print_ops(case_path: &Path) -> Result<(), String> {
    let case = load(case_path)?;
    let mut renderer = Renderer::new();
    render(&mut renderer, &case)?;
    for op in renderer.display_list() {
        match op {
            sprint_dash::draw::DrawOp::Text(run) => println!(
                "text {:?} {:?} size {:.3} x {:.3} baseline {:.3} scale_x {:.4} clip {:?}",
                run.text, run.weight, run.size, run.x, run.baseline, run.scale_x, run.clip
            ),
            other => println!("{other:?}"),
        }
    }
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["--dash", layout, out, options @ ..] => render_dash(Path::new(layout), Path::new(out), options),
        ["--all", cases, out] => render_all(Path::new(cases), Path::new(out), ""),
        ["--all", cases, out, filter] => render_all(Path::new(cases), Path::new(out), filter),
        ["--ops", case] => print_ops(Path::new(case)),
        ["--bench", case] => bench(Path::new(case), 3000),
        ["--bench", case, n] => n.parse().map_err(|_| format!("not a count: {n}")).and_then(|n| bench(Path::new(case), n)),
        [case, out] if !case.starts_with("--") => render_one(Path::new(case), Path::new(out)),
        _ => Err("usage: render --dash <layout.json> <out.png> [--page <id>] [--style panels|grid|bars] [--size WxH] | <case.json> <out.png> \
                  | --all <cases-dir> <out-dir> [filter] | --bench <case.json> [iterations] | --ops <case.json>"
            .to_owned()),
    };
    if let Err(e) = result {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
