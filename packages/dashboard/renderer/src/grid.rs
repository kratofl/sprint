// Pure grid/layout math: grid-rect placement and page selection. Port of
// `packages/dashboard/src/grid.ts`.

use crate::groups::drawn_widgets;
use crate::model::{DashLayout, DashPage, DashWidget};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PixelRect {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

impl PixelRect {
    pub const fn new(left: f64, top: f64, width: f64, height: f64) -> PixelRect {
        PixelRect { left, top, width, height }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GridSpan {
    pub col: f64,
    pub row: f64,
    pub col_span: f64,
    pub row_span: f64,
}

impl From<&DashWidget> for GridSpan {
    fn from(widget: &DashWidget) -> Self {
        GridSpan { col: widget.col, row: widget.row, col_span: widget.col_span, row_span: widget.row_span }
    }
}

/// JavaScript's `Math.round`: nearest integer, an exact `.5` toward +infinity.
pub fn js_round(value: f64) -> f64 {
    let floor = value.floor();
    if value - floor >= 0.5 { floor + 1.0 } else { floor }
}

/// One edge of a widget's span, mapped from a grid line to a pixel column/row.
fn grid_edge(total: f64, divisions: f64, edge: f64) -> f64 {
    if total <= 0.0 || divisions <= 0.0 {
        return 0.0;
    }
    js_round(edge * total / divisions).max(0.0).min(total)
}

fn normalize_edges(start: f64, end: f64, total: f64) -> (f64, f64) {
    if total <= 0.0 {
        return (0.0, 0.0);
    }
    let clamped_start = start.max(0.0).min(total - 1.0);
    let raw_end = if end <= clamped_start { clamped_start + 1.0 } else { end };
    (clamped_start, raw_end.min(total))
}

/// A widget's rectangle in pixels, given the layout's grid and canvas size.
pub fn grid_rect(width: f64, height: f64, cols: f64, rows: f64, span: GridSpan) -> PixelRect {
    let left = grid_edge(width, cols, span.col);
    let right = grid_edge(width, cols, span.col + span.col_span);
    let top = grid_edge(height, rows, span.row);
    let bottom = grid_edge(height, rows, span.row + span.row_span);
    let (left, right) = normalize_edges(left, right, width);
    let (top, bottom) = normalize_edges(top, bottom, height);
    PixelRect { left, top, width: right - left, height: bottom - top }
}

/// An alert's span on its layout grid (`alertPanelRect`'s argument).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AlertSpan {
    pub col: f64,
    pub row: f64,
    pub col_span: f64,
    pub row_span: f64,
    pub grid_cols: f64,
    pub grid_rows: f64,
}

/// The same raw grid-edge math as `grid_rect`, without the clamp/normalize pass — an alert
/// banner's panel, inset by 2px.
pub fn alert_panel_rect(width: f64, height: f64, span: AlertSpan) -> PixelRect {
    let left = grid_edge(width, span.grid_cols, span.col);
    let top = grid_edge(height, span.grid_rows, span.row);
    let right = grid_edge(width, span.grid_cols, span.col + span.col_span);
    let bottom = grid_edge(height, span.grid_rows, span.row + span.row_span);
    PixelRect { left: left + 2.0, top: top + 2.0, width: right - 2.0 - (left + 2.0), height: bottom - 2.0 - (top + 2.0) }
}

/// The compact RaceLogic-inspired island: 4:1 in every orientation, centered on the canvas.
pub fn race_logic_panel_bounds(width: f64, height: f64) -> PixelRect {
    let panel_width = (width - width % 4.0).max(4.0);
    let panel_height = height.min((panel_width / 4.0).floor());
    PixelRect { left: (width - panel_width) / 2.0, top: (height - panel_height) / 2.0, width: panel_width, height: panel_height }
}

/// Selects the page to render: idle takes priority, then an explicit id, then the first page.
pub fn select_page<'a>(layout: &'a DashLayout, page_id: Option<&str>, idle: bool) -> Option<&'a DashPage> {
    if idle {
        return layout.idle_page.as_ref().or(layout.pages.first());
    }
    if let Some(page_id) = page_id.filter(|id| !id.is_empty()) {
        let lower = page_id.to_lowercase();
        if let Some(page) = layout.pages.iter().find(|page| page.id.to_lowercase() == lower) {
            return Some(page);
        }
        if let Some(idle_page) = layout.idle_page.as_ref().filter(|page| page.id.to_lowercase() == lower) {
            return Some(idle_page);
        }
        return layout.pages.first();
    }
    layout.pages.first().or(layout.idle_page.as_ref())
}

/// True when `page` draws the full-canvas RaceLogic lap timer (hidden widgets and stack layers
/// it does not show do not count).
pub fn page_has_race_logic_lap_timer(page: Option<&DashPage>) -> bool {
    page.is_some_and(|page| drawn_widgets(page).iter().any(|widget| widget.widget_type == "racelogic_lap_timer"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span(col: f64, row: f64, col_span: f64, row_span: f64) -> GridSpan {
        GridSpan { col, row, col_span, row_span }
    }

    fn page(id: &str) -> DashPage {
        DashPage { id: id.to_owned(), name: id.to_owned(), ..DashPage::default() }
    }

    #[test]
    fn grid_rect_divides_the_canvas_evenly_for_a_widget_spanning_the_whole_grid() {
        assert_eq!(grid_rect(800.0, 480.0, 20.0, 12.0, span(0.0, 0.0, 20.0, 12.0)), PixelRect::new(0.0, 0.0, 800.0, 480.0));
    }

    #[test]
    fn grid_rect_places_a_widget_at_its_column_row_offset_with_the_expected_size() {
        let rect = grid_rect(800.0, 480.0, 20.0, 12.0, span(5.0, 0.0, 4.0, 1.0));
        assert_eq!(rect.left, 200.0);
        assert_eq!(rect.width, 160.0);
    }

    #[test]
    fn grid_rect_never_emits_a_negative_or_inverted_span_even_for_a_zero_span_widget() {
        let rect = grid_rect(800.0, 480.0, 20.0, 12.0, span(19.0, 11.0, 0.0, 0.0));
        assert!(rect.width >= 1.0 && rect.height >= 1.0);
        assert!(rect.left + rect.width <= 800.0 && rect.top + rect.height <= 480.0);
    }

    #[test]
    fn select_page_prefers_the_idle_page_when_idle_is_requested_falling_back_to_the_first_page() {
        let with_idle = DashLayout { idle_page: Some(page("idle")), pages: vec![page("p1")], ..DashLayout::default() };
        assert_eq!(select_page(&with_idle, None, true).map(|p| p.id.as_str()), Some("idle"));
        let without = DashLayout { pages: vec![page("p1")], ..DashLayout::default() };
        assert_eq!(select_page(&without, None, true).map(|p| p.id.as_str()), Some("p1"));
    }

    #[test]
    fn select_page_matches_an_explicit_page_id_case_insensitively_else_falls_back_to_the_first_page() {
        let layout = DashLayout { pages: vec![page("Overview"), page("Race")], ..DashLayout::default() };
        assert_eq!(select_page(&layout, Some("race"), false).map(|p| p.id.as_str()), Some("Race"));
        assert_eq!(select_page(&layout, Some("not-a-page"), false).map(|p| p.id.as_str()), Some("Overview"));
    }

    #[test]
    fn page_has_race_logic_lap_timer_counts_the_lap_timer_only_where_it_is_drawn() {
        use crate::model::{DashWidgetGroup, GroupMode};
        let widget = |id: &str, widget_type: &str, group: Option<&str>, hidden: bool| DashWidget {
            id: id.to_owned(),
            widget_type: widget_type.to_owned(),
            group: group.map(str::to_owned),
            hidden,
            ..DashWidget::default()
        };
        let stack =
            DashWidgetGroup { id: "stack".to_owned(), name: "Stack".to_owned(), parent: None, mode: GroupMode::OneAtATime, shown_first: None, hidden: false };
        let with = |widgets: Vec<DashWidget>, groups: Vec<DashWidgetGroup>| DashPage { widgets, groups, ..page("p") };
        let timer = widget("t", "racelogic_lap_timer", Some("stack"), false);
        let fuel = widget("f", "fuel", Some("stack"), false);
        assert!(!page_has_race_logic_lap_timer(None));
        assert!(page_has_race_logic_lap_timer(Some(&with(vec![widget("w", "racelogic_lap_timer", None, false)], vec![]))));
        assert!(page_has_race_logic_lap_timer(Some(&with(vec![timer.clone(), fuel.clone()], vec![stack.clone()]))));
        assert!(!page_has_race_logic_lap_timer(Some(&with(vec![fuel, timer], vec![stack]))), "a layer the stack does not show");
        assert!(!page_has_race_logic_lap_timer(Some(&with(vec![widget("w", "racelogic_lap_timer", None, true)], vec![]))));
    }

    #[test]
    fn race_logic_panel_bounds_is_always_exactly_4_to_1_and_centered_on_the_canvas() {
        let bounds = race_logic_panel_bounds(800.0, 480.0);
        assert_eq!(bounds.width / bounds.height, 4.0);
        assert_eq!(bounds.left, (800.0 - bounds.width) / 2.0);
        assert_eq!(bounds.top, (480.0 - bounds.height) / 2.0);
    }

    #[test]
    fn alert_panel_rect_insets_the_raw_grid_rect_by_2px_on_each_side_without_normalizing() {
        let rect = alert_panel_rect(800.0, 480.0, AlertSpan { col: 6.0, row: 3.0, col_span: 8.0, row_span: 6.0, grid_cols: 20.0, grid_rows: 12.0 });
        assert_eq!(rect.left, 242.0);
        assert_eq!(rect.width, 560.0 - 240.0 - 4.0);
    }

    #[test]
    fn js_round_breaks_ties_toward_positive_infinity() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
    }
}
