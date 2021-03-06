import React, { Component } from 'react'
import * as d3 from "d3"
import uuidv1 from 'uuid/v1';

export default class Graph extends Component {
    state = {
        uuid: uuidv1(),
        graph: null
    }
    focus_node = null;
    highlight_trans = 0.2;

    static getDerivedStateFromProps(nextProps, prevState) {
        if(nextProps.graph !== prevState.graph) {
            return { graph: nextProps.graph };
        }
        return null;
    }

    componentDidMount() {
        const rootNode = this.rootnode;

        var svg = this.svg = d3.select(rootNode);

        // needed to offset the simulation's center
        var wrapper = svg.append("g");

        // needed for applying zoom and pan
        this.container = wrapper.append("g")
            .attr("class", "everything");

        this.container.append("g")
                .attr("class", "links");

        this.container.append("g")
                .attr("class", "nodes")

        // Zoom functions
        var zoom_actions = () => {
            this.container.attr("transform", d3.event.transform);
        }

        // add zoom capabilities
        var zoom = d3.zoom()
        .on("zoom." + this.state.uuid, zoom_actions);

        svg.call(zoom);
        var rect = svg.node().getBoundingClientRect();
        svg.call(zoom.transform, d3.zoomIdentity.translate(
            Math.min(rect.width, window.innerWidth) / 2,
            Math.min(rect.height, window.innerHeight) / 2
        ).scale(.5));

        this.simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id(function(d) { return d.id; }).distance(100))
            .force("charge", d3.forceManyBody().strength(-1))
            .force("center", d3.forceCenter())
            .force("collision", d3.forceCollide(16));

        if(this.state.graph !== null) {
            this.renderGraph();
        }
    }

    componentWillUnmount() {
        this.simulation.stop();
        this.svg.on("." + this.state.uuid, null);
        d3.select(window).on("." + this.state.uuid, null);
        this.svg.selectAll().remove();
        this.simulation = null;
        this.svg = null;
    }

    componentDidUpdate(prevProps, prevState) {
        if(prevState.graph !== this.state.graph) {
            this.renderGraph();
        }
    }

    renderGraph() {
        if(!this.state.graph || this.state.graph === true) {
            return;
        }

        this.simulation.stop();

        var graph = this.state.graph.toD3();

        var links = this.container.select("g.links")
            .selectAll("line")
            .data(graph.edges, (d) => d.source + d.target);

        links.exit().remove();

        this.links = links = links.enter().append("line")
                .attr("stroke-width", 1)
            .merge(links);

        var nodes = this.container.select("g.nodes")
            .selectAll(".node")
            .data(graph.nodes, (d) => d.id);

        nodes.exit().remove();

        var nodesenter = nodes.enter().append("g")
                .attr("class", "node")
                .call(d3.drag()
                    .on("start." + this.state.uuid, this.dragstarted)
                    .on("drag." + this.state.uuid, this.dragged)
                    .on("end." + this.state.uuid, this.dragended));

        nodesenter.append("image")
            .attr("xlink:href", (d) => process.env.PUBLIC_URL + "/img/" + d.type + ".svg")
            .attr("x", -8)
            .attr("y", -8)
            .attr("width", 16)
            .attr("height", 16)
            .attr("class", "icon svg");

        nodesenter.append("text")
            .attr("dx", 12)
            .attr("dy", ".35em")
            .text(function(d) { return d.title });

        nodesenter.append("title")
            .text(function(d) { return d.id; })

        nodesenter.on("mouseover." + this.state.uuid, (d) => {
                if(this.focus_node === null) {
                    this.set_highlight(d, this.directLinkNodeFilter, this.directLinkLinkFilter);
                }
            })
            .on("mouseout." + this.state.uuid, (d) => {
                if(this.focus_node === null) {
                    this.exit_highlight();
                }
            });

        this.nodes = nodes = nodesenter.merge(nodes);

        d3.select(window).on("mouseup." + this.state.uuid, () => {
            this.focus_node = null;
            this.exit_highlight();
        });

        this.simulation
            .nodes(graph.nodes)
            .on("tick", this.ticked);

        this.simulation.force("link")
            .links(graph.edges);

        this.simulation.alpha(1).restart();
    }

    ticked = () => {
        this.links
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; });

        this.nodes.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });
    }

    dragstarted = (d) => {
        this.focus_node = d;
        if (!d3.event.active) {
            this.simulation.alpha(1).restart();
        }
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged = (d) => {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    dragended = (d) => {
        this.focus_node = null;
        if (!d3.event.active) this.simulation.alpha(1);
        d.fx = null;
        d.fy = null;
    }


    exit_highlight = () => {
        this.svg.style("cursor","move");

        this.nodes.select("image").style("opacity", null);
        this.nodes.select("text").style("opacity", null);
        this.links.style("stroke-opacity", null);
    }

    directLinkNodeFilter(n1, n2) {
        return n1 === n2 || this.state.graph.hasEdge(n1.id, n2.id) || this.state.graph.hasEdge(n2.id, n1.id);
    }

    directLinkLinkFilter(n1, n2) {
        return n2.source.index === n1.index || n2.target.index === n1.index;
    }

    set_highlight = (d, nodeFilter, edgeFilter) => {
        this.svg.style("cursor","pointer");
        var highlight_trans = this.highlight_trans;

        this.nodes.select("image").style("opacity", (o) => {
            return this.directLinkNodeFilter(d, o) ? null : highlight_trans;
        });
        this.nodes.select("text").style("opacity", (o) => {
            return this.directLinkNodeFilter(d, o) ? null : highlight_trans;
        });
        this.links.style("stroke-opacity", (o) => {
            return this.directLinkLinkFilter(d, o) ? null : highlight_trans;
        });
    }
    render() {
        const height = this.props.height ? this.props.height : "100%";
        return <svg ref={node => this.rootnode = node}
        width="100%" height={height}>
        </svg>
    }
}
