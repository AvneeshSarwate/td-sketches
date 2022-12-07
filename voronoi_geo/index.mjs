import { WebSocketServer } from 'ws';
import { Voronoi } from "./rhill-voronoi-core.mjs";

const wss = new WebSocketServer({ port: 8080 });
const voronoi = new Voronoi();
let diagram = null;
wss.on('connection', function connection(ws) {
    ws.on('message', function message(data) {
        const ptsArray = JSON.parse(data.toString());
        const pts = ptsArray[0].map((e, i, arr) => ({ x: ptsArray[0][i], y: ptsArray[1][i] }));
        if (diagram) voronoi.recycle(diagram);
        diagram = voronoi.compute(pts, { xl: 0, xr: 1, yt: 0, yb: 1 })
        // const polys = diagram.cells.map(c => {
        //     return c.halfedges.map(h => {
        //         const sp = h.getStartpoint();
        //         return { x: sp.x, y: sp.y };
        //     });
        // });
        const polys = diagram.cells.map(c => {
            let x = [];
            let y = []
            c.halfedges.forEach(h => {
                const sp = h.getStartpoint();
                x.push(sp.x);
                y.push(sp.y);
            });
            return [x, y];
        });
        //todo remap the cells into the order of the input points
        /* Important - cell order does not reflect input site order - the the voronoiID,
       which the voronoi library adds onto the site objects,
       maps the site => its corresponding cell */
        const sorted_polys = pts.map(pt => polys[pt.voronoiId]);
        ws.send(JSON.stringify(sorted_polys));
    });

    ws.send('something');
});