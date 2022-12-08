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
        let maxLen = 0;
        const polys = diagram.cells.map(c => {
            let x = [];
            let y = []
            c.halfedges.forEach(h => {
                const sp = h.getStartpoint();
                x.push(sp.x);
                y.push(sp.y);
            });
            maxLen = Math.max(maxLen, x.length);
            return [x, y];
        });
        //todo remap the cells into the order of the input points
        /* Important - cell order does not reflect input site order - the the voronoiID,
       which the voronoi library adds onto the site objects,
       maps the site => its corresponding cell */
        const sorted_polys = pts.map(pt => polys[pt.voronoiId]);

        //pad the lengths of each subarray with the last element so they are all the same length
        sorted_polys.forEach(poly => {
            //TODO - see if array is empty here and handle it
            const lastX = poly[0][poly[0].length - 1];
            const lastY = poly[1][poly[0].length - 1];
            while (poly[0].length < maxLen) {
                poly[0].push(lastX);
                poly[1].push(lastY);
            }
        });

        //convert polys into [polyNum][polyPointNum][x,y]
        let reorderd_polys = [];
        sorted_polys.forEach(poly => {
            const per_pt_poly = [];
            for (let i = 0; i < maxLen; i++) {
                per_pt_poly.push([poly[0][i], poly[1][i]]);
            }
            reorderd_polys.push(per_pt_poly);
        });
        // ws.send(JSON.stringify(reorderd_polys));

        //flatten reorderd_polys and convert to a Float32Array
        reorderd_polys = new Float32Array(reorderd_polys.flat(2));
        ws.send(reorderd_polys.buffer);
    });

    ws.send('something');
});