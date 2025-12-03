	/**
	 * @author cotterzz / https://github.com/cotterzz
	 * this class adapted from THREE.LatheBufferGeometry by:
	 * @author zz85 / https://github.com/zz85
	 * @author bhouston / http://clara.io
	 * @author Mugen87 / https://github.com/Mugen87
	 */

	// LoftLatheBufferGeometry

class LoftLatheBufferGeometry extends THREE.BufferGeometry {
	constructor( points, segments, phiStart, phiLength ){
		super();

		this.type = 'LoftLatheBufferGeometry';

		this.parameters = {
			points: points,
			segments: segments,
			phiStart: phiStart,
			phiLength: phiLength
		};

		segments = Math.floor( segments ) || 12;
		phiStart = phiStart || 0;
		phiLength = phiLength || Math.PI * 2;

		// clamp phiLength so it's in range of [ 0, 2PI ]
		console.log(THREE._Math)
		phiLength = Math.max( 0, Math.min( Math.PI * 2, phiLength ) );

		// buffers

		var indices = [];
		var vertices = [];
		var uvs = [];

		// helper variables

		var base;
		var inverseSegments = 1.0 / segments;
		var vertex = new THREE.Vector3();
		var uv = new THREE.Vector2();
		var i, j;

		// generate vertices and uvs

		for ( i = 0; i <= segments; i ++ ) {

			var phi = phiStart + i * inverseSegments * phiLength;

			var sin = Math.sin( phi );
			var cos = Math.cos( phi );

			// get index a for interpolation
			var indexExact = points.length*(phi/(Math.PI * 2));
			var indexA = Math.floor(indexExact);
			// get index b for interpolation
			var indexB = Math.ceil(indexExact);
			var weight = indexExact-indexA;

			if(indexB==points.length){indexB=0}
			if(indexA==points.length){indexA=0}

			for ( j = 0; j <= ( points[0].length - 1 ); j ++ ) {

				var xa = points[indexA][ j ].x;
				var xb = points[indexB][ j ].x;

				var ipx = xa + ((xb-xa)*weight);

				var ya = points[indexA][ j ].y;
				var yb = points[indexB][ j ].y;

				var ipy = ya + ((yb-ya)*weight);

				// get difference between a and b

				// get fraction of difference to add to point a

				// vertex

				vertex.x = ipx * sin;
				vertex.y = ipy;
				vertex.z = ipx * cos;

				vertices.push( vertex.x, vertex.y, vertex.z );

				// uv

				uv.x = i / segments;
				uv.y = j / ( points[0].length - 1 );

				uvs.push( uv.x, uv.y );


			}

		}

		// indices

		for ( i = 0; i < segments; i ++ ) {

			for ( j = 0; j < ( points[0].length - 1 ); j ++ ) {

				base = j + i * points[0].length;

				var a = base;
				var b = base + points[0].length;
				var c = base + points[0].length + 1;
				var d = base + 1;

				// faces

				indices.push( a, b, d );
				indices.push( b, c, d );

			}

		}

		// build geometry

		this.setIndex( indices );
		this.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
		this.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );

		// generate normals

		this.computeVertexNormals();

		// if the geometry is closed, we need to average the normals along the seam.
		// because the corresponding vertices are identical (but still have different UVs).

		if ( phiLength === Math.PI * 2 ) {

			var normals = this.attributes.normal.array;
			var n1 = new THREE.Vector3();
			var n2 = new THREE.Vector3();
			var n = new THREE.Vector3();

			// this is the buffer offset for the last line of vertices

			base = segments * points[0].length * 3;

			for ( i = 0, j = 0; i < points[0].length; i ++, j += 3 ) {

				// select the normal of the vertex in the first line

				n1.x = normals[ j + 0 ];
				n1.y = normals[ j + 1 ];
				n1.z = normals[ j + 2 ];

				// select the normal of the vertex in the last line

				n2.x = normals[ base + j + 0 ];
				n2.y = normals[ base + j + 1 ];
				n2.z = normals[ base + j + 2 ];

				// average normals

				n.addVectors( n1, n2 ).normalize();

				// assign the new values to both normals

				normals[ j + 0 ] = normals[ base + j + 0 ] = n.x;
				normals[ j + 1 ] = normals[ base + j + 1 ] = n.y;
				normals[ j + 2 ] = normals[ base + j + 2 ] = n.z;
			}
		}
	}
}