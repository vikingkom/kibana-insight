import React, { Component } from 'react';
import { Dropdown } from 'semantic-ui-react';

const FILTER_NONE = Object.freeze({
    key: "null",
    text: "No Filter",
    value: "null"
});

export default class FilterSelector extends Component {
    state = {
        graph: null,
        filter: "null"
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        var next = null;
        if((nextProps.graph !== prevState.graph ||
            nextProps.type !== prevState.type) &&
            nextProps.graph &&
            nextProps.type) {
            const options = nextProps.graph.toD3().nodes
                .filter((n) => nextProps.type.indexOf(n.type) !== -1)
                .sort(FilterSelector.objectTitleComparator)
                .map((n) => ({ key: n.id, text: n.title, value: n.id }))
                .concat(FILTER_NONE);

            next = {
                graph: nextProps.graph,
                type: nextProps.type,
                options
            };
        }
        var nextFilter = nextProps.value === null ? "null" : nextProps.value;
        if(nextFilter !== prevState.filter) {
            if(next === null) {
                next = {};
            }
            Object.assign(next, { filter: nextFilter });
        }
        return next;
    }

    static objectTitleComparator(s1, s2) {
        if(!s1.title || !s2.title) {
            console.log("has no title:", s1, s2);
            return 0;
        }
        return s1.title.localeCompare(s2.title);
    }

    onFilterChange = (e, { value }) => {
        if(this.state.filter === value) {
            return;
        }
        this.setState({ filter: value });
        if(typeof this.props.onFilterChange === 'function') {
            this.props.onFilterChange(this.props.type, value === "null" ? null : value);
        }
    }

    render() {
        const options = this.state.options ? this.state.options : [FILTER_NONE];

        return <Dropdown
            selection
            search
            options={options}
            value={this.state.filter}
            onChange={this.onFilterChange} />;
    }
}
