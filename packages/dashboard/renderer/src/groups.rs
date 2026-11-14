// A page's widgets organised into groups: the tree the designer's sidebar shows and the rule for
// which widgets the wheel draws. Port of `packages/dashboard/src/groups.ts`.
//
// The model is flat on purpose. `page.widgets` holds every widget in page grid coordinates, in
// draw order; a widget's `group` names its group, a group's `parent` names the group it sits in.
// The order of a group among its siblings is not stored: it is where its first widget sits in
// `page.widgets`. An empty group has no widget to place it, so it comes after its non-empty
// siblings, in `page.groups` order.
//
// A group "one at a time" is a widget stack: each direct child (a widget or a group) is a layer,
// and only `shown_first` (else the first child) is drawn. Layers of one stack are the only widgets
// allowed to overlap (`may_overlap`). A hidden widget or group is not drawn but still holds its
// place on the grid.

use std::collections::{HashMap, HashSet};

use crate::model::{DashPage, DashWidget, DashWidgetGroup, GroupMode};

#[derive(Clone, Debug, PartialEq)]
pub enum DashNode<'a> {
    Widget(&'a DashWidget),
    Group { group: &'a DashWidgetGroup, children: Vec<DashNode<'a>> },
}

impl DashNode<'_> {
    pub fn id(&self) -> &str {
        match self {
            DashNode::Widget(widget) => &widget.id,
            DashNode::Group { group, .. } => &group.id,
        }
    }
}

/// The first group with each id, by id.
fn groups_by_id(page: &DashPage) -> HashMap<&str, &DashWidgetGroup> {
    let mut groups = HashMap::new();
    for group in &page.groups {
        groups.entry(group.id.as_str()).or_insert(group);
    }
    groups
}

/// Each group's parent as it is drawn: a missing parent, or one that would make a cycle, is the
/// page itself (`None`).
pub fn group_parents(page: &DashPage) -> HashMap<&str, Option<&str>> {
    fn existing<'a>(groups: &HashMap<&str, &DashWidgetGroup>, id: Option<&'a str>) -> Option<&'a str> {
        id.filter(|id| groups.contains_key(id))
    }
    let groups = groups_by_id(page);
    let existing = |id| existing(&groups, id);
    let mut parents = HashMap::new();
    for (&id, group) in &groups {
        let mut parent = existing(group.parent.as_deref());
        // Walk up from the parent; meeting this group again means a cycle, so it sits on the page.
        let mut seen = HashSet::from([id]);
        let mut at = parent;
        while let Some(current) = at {
            if !seen.insert(current) {
                parent = None;
                break;
            }
            at = existing(groups.get(current).and_then(|g| g.parent.as_deref()));
        }
        parents.insert(id, parent);
    }
    parents
}

/// The group a widget is drawn in, or `None` when it sits on the page (no group, or one that
/// does not exist).
fn widget_parent<'a>(widget: &'a DashWidget, parents: &HashMap<&str, Option<&str>>) -> Option<&'a str> {
    widget.group.as_deref().filter(|group| parents.contains_key(group))
}

/// The page as a tree, siblings in sidebar (= draw) order.
pub fn page_tree(page: &DashPage) -> Vec<DashNode<'_>> {
    let parents = group_parents(page);

    // A group sorts by its first widget, found by walking each widget up through its groups.
    let mut first_widget: HashMap<&str, usize> = HashMap::new();
    for (index, widget) in page.widgets.iter().enumerate() {
        let mut at = widget_parent(widget, &parents);
        while let Some(group) = at {
            first_widget.entry(group).or_insert(index);
            at = parents.get(group).copied().flatten();
        }
    }

    // Every node with its parent and its sort key (key, tie): widgets by their index, groups by
    // their first widget (empty ones last) and then by their order in `page.groups`.
    enum Entry<'a> {
        Widget(&'a DashWidget),
        Group(&'a DashWidgetGroup),
    }
    let mut entries: Vec<(Option<&str>, f64, i64, Entry)> = Vec::new();
    for (index, widget) in page.widgets.iter().enumerate() {
        entries.push((widget_parent(widget, &parents), index as f64, -1, Entry::Widget(widget)));
    }
    let mut seen = HashSet::new();
    for (tie, group) in page.groups.iter().filter(|group| seen.insert(group.id.as_str())).enumerate() {
        let key = first_widget.get(group.id.as_str()).map_or(f64::INFINITY, |&index| index as f64);
        entries.push((parents.get(group.id.as_str()).copied().flatten(), key, tie as i64, Entry::Group(group)));
    }
    entries.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.2.cmp(&b.2)));

    fn ordered<'a>(entries: &[(Option<&str>, f64, i64, Entry<'a>)], parent: Option<&str>) -> Vec<DashNode<'a>> {
        entries
            .iter()
            .filter(|entry| entry.0 == parent)
            .map(|entry| match entry.3 {
                Entry::Widget(widget) => DashNode::Widget(widget),
                Entry::Group(group) => DashNode::Group { group, children: ordered(entries, Some(&group.id)) },
            })
            .collect()
    }
    ordered(&entries, None)
}

/// The layer a one-at-a-time group draws: its `shown_first` child while that exists, else its
/// first.
pub fn shown_child<'n, 'a>(group: &DashWidgetGroup, children: &'n [DashNode<'a>]) -> Option<&'n DashNode<'a>> {
    children.iter().find(|child| Some(child.id()) == group.shown_first.as_deref()).or(children.first())
}

/// Every widget under a node (itself, for a widget), in draw order, hidden or not.
pub fn node_widgets<'a>(node: &DashNode<'a>) -> Vec<&'a DashWidget> {
    match node {
        DashNode::Widget(widget) => vec![widget],
        DashNode::Group { children, .. } => children.iter().flat_map(node_widgets).collect(),
    }
}

/// The widgets the wheel draws, in draw order: not hidden, in no hidden group, and in each stack
/// only under the layer it shows.
pub fn drawn_widgets(page: &DashPage) -> Vec<&DashWidget> {
    fn visit<'a>(node: &DashNode<'a>, out: &mut Vec<&'a DashWidget>) {
        match node {
            DashNode::Widget(widget) => {
                if !widget.hidden {
                    out.push(widget);
                }
            }
            DashNode::Group { group, .. } if group.hidden => {}
            DashNode::Group { group, children } if group.mode == GroupMode::OneAtATime => {
                if let Some(layer) = shown_child(group, children) {
                    visit(layer, out);
                }
            }
            DashNode::Group { children, .. } => children.iter().for_each(|child| visit(child, out)),
        }
    }
    let mut out = Vec::new();
    for node in &page_tree(page) {
        visit(node, &mut out);
    }
    out
}

/// For a widget (or a widget about to be added to `group`), the layer it is in for each stack
/// above it: stack id -> the id of the stack's child it descends from. `self_id` is the widget's
/// own id, its layer when it sits directly in a stack.
pub fn stack_layers(page: &DashPage, group: Option<&str>, self_id: &str) -> HashMap<String, String> {
    let parents = group_parents(page);
    // Later groups with the same id overwrite earlier ones, as `new Map(entries)` does.
    let modes: HashMap<&str, GroupMode> = page.groups.iter().map(|g| (g.id.as_str(), g.mode)).collect();
    let mut layers = HashMap::new();
    let mut below = self_id.to_owned();
    let mut at = group.filter(|g| parents.contains_key(g));
    while let Some(current) = at {
        if modes.get(current) == Some(&GroupMode::OneAtATime) && !layers.contains_key(current) {
            layers.insert(current.to_owned(), below.clone());
        }
        below = current.to_owned();
        at = parents.get(current).copied().flatten();
    }
    layers
}

/// Whether two widgets may share grid cells: only when they sit in different layers of one stack.
pub fn may_overlap(a: &HashMap<String, String>, b: &HashMap<String, String>) -> bool {
    a.iter().any(|(stack, layer)| b.get(stack).is_some_and(|other| other != layer))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn widget(id: &str, group: Option<&str>) -> DashWidget {
        DashWidget { id: id.to_owned(), widget_type: "text".to_owned(), col_span: 1.0, row_span: 1.0, group: group.map(str::to_owned), ..DashWidget::default() }
    }

    fn group(id: &str, mode: GroupMode, parent: Option<&str>) -> DashWidgetGroup {
        DashWidgetGroup { id: id.to_owned(), name: id.to_owned(), parent: parent.map(str::to_owned), mode, shown_first: None, hidden: false }
    }

    fn page(widgets: Vec<DashWidget>, groups: Vec<DashWidgetGroup>) -> DashPage {
        DashPage { id: "p".to_owned(), name: "P".to_owned(), widgets, groups }
    }

    /// The tree as `outline` prints it in groups.test.ts: widget ids, and `id[children]` for groups.
    fn outline(nodes: &[DashNode]) -> String {
        let parts: Vec<String> = nodes
            .iter()
            .map(|node| match node {
                DashNode::Widget(w) => w.id.clone(),
                DashNode::Group { group, children } => format!("{}[{}]", group.id, outline(children)),
            })
            .collect();
        parts.join(",")
    }

    fn drawn(page: &DashPage) -> Vec<&str> {
        drawn_widgets(page).into_iter().map(|w| w.id.as_str()).collect()
    }

    use GroupMode::{OneAtATime, Together};

    #[test]
    fn the_tree_orders_siblings_by_where_their_first_widget_sits_and_empty_groups_come_last() {
        let p = page(
            vec![widget("a", None), widget("b", Some("top")), widget("c", Some("inner")), widget("d", None), widget("e", Some("top"))],
            vec![group("empty", Together, None), group("inner", Together, Some("top")), group("top", Together, None)],
        );
        assert_eq!(outline(&page_tree(&p)), "a,top[b,inner[c],e],d,empty[]");
    }

    #[test]
    fn a_missing_or_cyclic_parent_puts_the_group_on_the_page_instead_of_losing_it() {
        let p = page(
            vec![widget("a", Some("x")), widget("b", Some("lost")), widget("c", Some("nowhere"))],
            vec![group("x", Together, Some("y")), group("y", Together, Some("x")), group("lost", Together, Some("gone"))],
        );
        let mut ids = drawn(&p);
        ids.sort();
        assert_eq!(ids, ["a", "b", "c"]);
    }

    #[test]
    fn a_stack_draws_its_shown_layer_else_its_first_child_and_nothing_under_a_hidden_one() {
        let base = page(
            vec![widget("a", Some("one")), widget("b", Some("two")), widget("c", Some("two"))],
            vec![
                DashWidgetGroup { shown_first: Some("two".to_owned()), ..group("stack", OneAtATime, None) },
                group("one", Together, Some("stack")),
                group("two", Together, Some("stack")),
            ],
        );
        let with_group = |id: &str, patch: fn(&mut DashWidgetGroup)| {
            let mut p = base.clone();
            p.groups.iter_mut().filter(|g| g.id == id).for_each(patch);
            p
        };
        assert_eq!(drawn(&base), ["b", "c"]);
        assert_eq!(drawn(&with_group("stack", |g| g.shown_first = Some("gone".to_owned()))), ["a"]);
        assert_eq!(drawn(&with_group("stack", |g| g.mode = Together)), ["a", "b", "c"]);
        assert!(drawn(&with_group("two", |g| g.hidden = true)).is_empty());
    }

    #[test]
    fn hidden_widgets_are_not_drawn_but_stay_in_the_tree() {
        let p = page(vec![widget("a", None), DashWidget { hidden: true, ..widget("b", None) }], vec![]);
        assert_eq!(drawn(&p), ["a"]);
        let all: Vec<&str> = page_tree(&p).iter().flat_map(node_widgets).map(|w| w.id.as_str()).collect();
        assert_eq!(all, ["a", "b"]);
    }

    #[test]
    fn only_widgets_in_different_layers_of_one_stack_may_overlap() {
        let p = page(
            vec![],
            vec![group("stack", OneAtATime, None), group("one", Together, Some("stack")), group("two", Together, Some("stack")), group("bar", Together, None)],
        );
        let layers = |group: Option<&str>, id: &str| stack_layers(&p, group, id);
        assert!(may_overlap(&layers(Some("one"), "a"), &layers(Some("two"), "b")));
        assert!(!may_overlap(&layers(Some("one"), "a"), &layers(Some("one"), "b")), "same layer");
        assert!(may_overlap(&layers(Some("stack"), "a"), &layers(Some("stack"), "b")), "two widgets that are each a layer");
        assert!(!may_overlap(&layers(Some("one"), "a"), &layers(None, "b")), "outside the stack");
        assert!(!may_overlap(&layers(Some("bar"), "a"), &layers(Some("bar"), "b")), "a together group");
    }
}
