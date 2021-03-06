import elasticsearch from 'elasticsearch';
import q from 'q';
import TYPE from './ObjectTypes';

const DEFAULT_MAXAGE = 1000 * 60 * 5;
const DASHBOARD_ALLOWED_CHILD_TYPES = [
    TYPE.VISUALIZATION,
    TYPE.SEARCH
];

export default class ObjectClient {
    constructor(esConfig, cluster) {
        this.config = esConfig;
        this.cluster = cluster;
        var c = Object.assign({}, esConfig.client, cluster.client, { host: cluster.host })
        this.client = new elasticsearch.Client(c);
        this.cache = null;
    }

    getKibanaObjects(type) {
        return q.ninvoke(this.client, "search", {
            index: this.cluster.index || '.kibana',
            q: 'type:' + type,
            size: this.config.searchSize
        }).get(0).then(function(res) {
            console.log("got " + res.hits.hits.length + " objects of type " + type);
            return res;
        });
    }

    kibanaObjectMapper(type, search) {
        if(search.hits.total > this.config.searchSize) {
            throw new Error("Didn't fetch all results! Total: " + search.hits.total);
        }
        return search.hits.hits.map((e) => ({
            id: e._id,
            type: type,
            title: e._source[type].title,
        }));
    }

    get() {
        var now = Date.now();
        if(this.cache !== null) {
            return this.cache.then((res) => {
                if(now - (this.cluster.maxage || this.config.maxage || DEFAULT_MAXAGE) < res.ts) {
                    return res;
                }

                return this.cache = this.fetch().spread((nodes, edges) => ({
                    ts: now,
                    nodes,
                    edges
                }));
            });
        }

        return this.cache = this.fetch().spread((nodes, edges) => ({
            ts: now,
            nodes,
            edges
        }));
    }

    fetch() {
        console.log("Fetching data");
        return q.all([
            this.getKibanaObjects(TYPE.INDEX_PATTERN),
            this.getKibanaObjects(TYPE.SEARCH),
            this.getKibanaObjects(TYPE.VISUALIZATION),
            this.getKibanaObjects(TYPE.DASHBOARD)])
        .spread((indexPatterns, searches, visualizations, dashboards) => {
            var nodes = [].concat(
                this.kibanaObjectMapper(TYPE.INDEX_PATTERN, indexPatterns),
                this.kibanaObjectMapper(TYPE.SEARCH, searches),
                this.kibanaObjectMapper(TYPE.VISUALIZATION, visualizations),
                this.kibanaObjectMapper(TYPE.DASHBOARD, dashboards)
            );
            var edges = [];
            var addEdge = function(from, to) {
                edges.push({ source: from, target: to });
            };

            searches.hits.hits.forEach((s) => {
                var ip = TYPE.INDEX_PATTERN + ':' + JSON.parse(s._source.search.kibanaSavedObjectMeta.searchSourceJSON).index;
                addEdge(s._id, ip);
            });

            visualizations.hits.hits.forEach((v) => {
                if(v._source.visualization.savedSearchId) {
                    let sid = TYPE.SEARCH + ':' + v._source.visualization.savedSearchId;
                    addEdge(v._id, sid);
                }
                var metaSource = v._source.visualization.kibanaSavedObjectMeta.searchSourceJSON;
                if(metaSource) {
                    let meta = JSON.parse(metaSource);
                    if(meta.index) {
                        let ip = TYPE.INDEX_PATTERN + ':' + meta.index;
                        addEdge(v._id, ip);
                    }
                }
            });

            dashboards.hits.hits.forEach((d) => {
                var metaSource = d._source.dashboard.panelsJSON
                if(metaSource) {
                    var meta = JSON.parse(metaSource);
                    meta.filter((v) => DASHBOARD_ALLOWED_CHILD_TYPES.indexOf(v.type) !== -1).forEach((c) => {
                        let cid = c.type + ':' + c.id;
                        addEdge(d._id, cid);
                    });
                }
            });

            // find objects with references to missing objects
            var missing = edges.filter((e) => nodes.findIndex((n) => n.id === e.target) === -1);
            if(missing.length > 0) {
                nodes.push({ id: TYPE.MISSING, type: TYPE.MISSING, title: "Missing" });
                missing.forEach((e) => {
                    e.target = TYPE.MISSING;
                });
            }

            console.log("Got " + nodes.length + " nodes, " + edges.length + " edges");
            return [nodes, edges];
        });
    }

    exportObjects(ids) {
        var docs = ids.map(i => ({ _id: i }));

        return q.ninvoke(this.client, "mget", {
            index: this.cluster.index || '.kibana',
            type: "doc",
            body: { docs }
        }).get(0).then(res => {
            let missing = res.docs.filter(d => d.found !== true);
            if(missing.length > 0) {
                console.log("Error while exporting objects. Some objects couldn't be found:", missing);
                throw new Error("Some objects couldn't be found!")
            }
            return res.docs.map(o => this.exportObjectMapper(o));
        });
    }

    exportObjectMapper = obj => {
        switch(obj._source.type) {
            case TYPE.DASHBOARD:
                return this.exportGenericMapper(obj);
            case TYPE.VISUALIZATION:
                return this.exportGenericMapper(obj);
            case TYPE.SEARCH:
                return this.exportGenericMapper(obj);
            default:
                throw new Error("Unknown object type: " + obj._source.type);
        }
    }

    exportGenericMapper(obj) {
        let s = obj._id.split(":");
        if(s.length !== 2) {
            throw new Error("Unsupported object _id");
        }

        return {
            _id: s[1],
            _type: s[0],
            _source: obj._source[obj._source.type]
        };
    }
}
