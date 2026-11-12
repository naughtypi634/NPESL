(function (NC) {
  'use strict';

  if (NC.debug == null) NC.debug = false;

  // Every interactive widget on this page is a finite state machine. Keeping
  // the transition table in one place makes the legal moves explicit for
  // people reading the code, prevents half-applied states, and gives tests and
  // agents a stable value to assert on. `onChange(next, previous, detail)`
  // runs after the state flips, so callers can mirror it onto the DOM.
  //
  //   var phase = NC.phase({
  //     name: 'drag',
  //     initial: 'idle',
  //     transitions: {
  //       idle: ['pressed'],
  //       pressed: ['dragging', 'idle'],
  //       dragging: ['idle']
  //     },
  //     onChange: function (next) { handle.setAttribute('data-phase', next); }
  //   });
  //
  // `set` is idempotent; an illegal move is refused (and warned about when
  // NC.debug is on) instead of silently corrupting the UI.
  NC.phase = function (spec) {
    var name = spec.name || 'phase';
    var transitions = spec.transitions || {};
    var current = spec.initial;
    if (!transitions[current]) transitions[current] = [];

    function can(next) {
      if (next === current) return true;
      var allowed = transitions[current];
      return !!allowed && allowed.indexOf(next) !== -1;
    }

    function set(next, detail) {
      if (next === current) return true;
      if (!can(next)) {
        if (NC.debug) {
          console.warn('phase[' + name + ']: illegal transition ' + current + ' -> ' + next);
        }
        return false;
      }
      var previous = current;
      current = next;
      if (spec.onChange) spec.onChange(current, previous, detail || {});
      return true;
    }

    return {
      name: name,
      get: function () { return current; },
      is: function (value) { return current === value; },
      can: can,
      set: set
    };
  };
})(window.NPESLCharts);
