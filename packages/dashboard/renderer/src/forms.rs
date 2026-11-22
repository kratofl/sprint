// The sizes each widget is drawn for. `packages/dashboard/src/widgetForms.json` lists a widget's
// forms, largest first, each with the smallest box (at 800x480) it is drawn in; the designer reads
// the same file to name the form a box lands in and to stop at the smallest one. A widget with
// several forms draws less in a smaller one (`WidgetContext::form`); a type the file does not list
// has its one default form.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Deserialize)]
struct Form {
    width: f64,
    height: f64,
}

#[derive(Deserialize)]
struct Table {
    default: Vec<Form>,
    types: BTreeMap<String, Vec<Form>>,
}

fn table() -> &'static Table {
    static TABLE: OnceLock<Table> = OnceLock::new();
    // The file is part of the build; its test below fails before a broken one ships.
    TABLE.get_or_init(|| serde_json::from_str(include_str!("../../src/widgetForms.json")).unwrap_or(Table { default: Vec::new(), types: BTreeMap::new() }))
}

/// The form a widget of `widget_type` draws in a `width` x `height` box at 800x480: the largest
/// form the box holds, 0 being the largest; the smallest when it holds none (an older dash's box).
pub fn form_index(widget_type: &str, width: f64, height: f64) -> usize {
    let table = table();
    let forms = table.types.get(widget_type).unwrap_or(&table.default);
    forms.iter().position(|form| width >= form.width && height >= form.height).unwrap_or(forms.len().saturating_sub(1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_forms_file_parses_and_every_widget_has_a_form_largest_first() {
        let table: Table = serde_json::from_str(include_str!("../../src/widgetForms.json")).expect("widgetForms.json parses");
        assert!(!table.default.is_empty());
        for (widget_type, forms) in &table.types {
            assert!(!forms.is_empty(), "{widget_type} has a form");
            for pair in forms.windows(2) {
                assert!(pair[0].width >= pair[1].width && pair[0].height >= pair[1].height, "{widget_type}'s forms shrink");
            }
        }
    }

    #[test]
    fn a_box_draws_the_largest_form_it_holds_and_never_less_than_the_smallest() {
        assert_eq!(form_index("tyre", 180.0, 120.0), 0);
        assert_eq!(form_index("tyre", 180.0, 90.0), 1, "too short for the brake temperature");
        assert_eq!(form_index("tyre", 120.0, 120.0), 2, "too narrow for the temperatures");
        assert_eq!(form_index("tyre", 40.0, 40.0), 2, "below the smallest form it still draws that one");
        assert_eq!(form_index("speed", 40.0, 40.0), 0, "a widget with one form");
    }
}
