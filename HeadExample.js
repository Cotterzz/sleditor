class HeadExample extends THREE.Object3D{
	constructor(){
		super();
		this.create();
	}

	create(){
		var points = [[],[],[],[],[],[],[],[]];


		points[5].push(new THREE.Vector2(0, 0));
		points[5].push(new THREE.Vector2(2, 1));
		points[5].push(new THREE.Vector2(3, 2));
		points[5].push(new THREE.Vector2(4, 2.5));
		points[5].push(new THREE.Vector2(6, 4));
		points[5].push(new THREE.Vector2(4, 5));
		points[5].push(new THREE.Vector2(3.5, 6));
		points[5].push(new THREE.Vector2(3, 6));
		points[5].push(new THREE.Vector2(3.5, 6.5));
		points[5].push(new THREE.Vector2(3.5, 7));
		points[5].push(new THREE.Vector2(2, 8));
		points[5].push(new THREE.Vector2(0, 7));

		points[6].push(new THREE.Vector2(0, 0));
		points[6].push(new THREE.Vector2(2, 1));
		points[6].push(new THREE.Vector2(4, 2));
		points[6].push(new THREE.Vector2(1.5, 3));
		points[6].push(new THREE.Vector2(3.5, 4));
		points[6].push(new THREE.Vector2(4, 5));
		points[6].push(new THREE.Vector2(3.5, 6));
		points[6].push(new THREE.Vector2(3.5, 6));
		points[6].push(new THREE.Vector2(3.5, 6.5));
		points[6].push(new THREE.Vector2(4, 7));
		points[6].push(new THREE.Vector2(1, 8));
		points[6].push(new THREE.Vector2(0, 7));

		points[7].push(new THREE.Vector2(0, 0));
		points[7].push(new THREE.Vector2(2, 0.5));
		points[7].push(new THREE.Vector2(5, 2));
		points[7].push(new THREE.Vector2(5, 3));
		points[7].push(new THREE.Vector2(6, 4));
		points[7].push(new THREE.Vector2(6, 5));
		points[7].push(new THREE.Vector2(5, 6));
		points[7].push(new THREE.Vector2(5, 7));
		points[7].push(new THREE.Vector2(4, 7.5));
		points[7].push(new THREE.Vector2(2, 8));
		points[7].push(new THREE.Vector2(1, 8));
		points[7].push(new THREE.Vector2(0, 7));

		points[0].push(new THREE.Vector2(0, 0));
		points[0].push(new THREE.Vector2(1.5, 0.5));
		points[0].push(new THREE.Vector2(4, 2));
		points[0].push(new THREE.Vector2(5, 3));
		points[0].push(new THREE.Vector2(6, 4));
		points[0].push(new THREE.Vector2(6, 5));
		points[0].push(new THREE.Vector2(5, 6));
		points[0].push(new THREE.Vector2(4, 7));
		points[0].push(new THREE.Vector2(3, 7.5));
		points[0].push(new THREE.Vector2(1, 8));
		points[0].push(new THREE.Vector2(0.5, 8));
		points[0].push(new THREE.Vector2(0, 7));

		points[1].push(new THREE.Vector2(0, 0));
		points[1].push(new THREE.Vector2(1.5, 0.5));
		points[1].push(new THREE.Vector2(4, 2));
		points[1].push(new THREE.Vector2(5, 3));
		points[1].push(new THREE.Vector2(6, 4));
		points[1].push(new THREE.Vector2(6, 5));
		points[1].push(new THREE.Vector2(5, 6));
		points[1].push(new THREE.Vector2(4, 7));
		points[1].push(new THREE.Vector2(3, 7.5));
		points[1].push(new THREE.Vector2(1, 8));
		points[1].push(new THREE.Vector2(0.5, 8));
		points[1].push(new THREE.Vector2(0, 7));

		points[2].push(new THREE.Vector2(0, 0));
		points[2].push(new THREE.Vector2(1.5, 0.5));
		points[2].push(new THREE.Vector2(4, 2));
		points[2].push(new THREE.Vector2(5, 3));
		points[2].push(new THREE.Vector2(6, 4));
		points[2].push(new THREE.Vector2(6, 5));
		points[2].push(new THREE.Vector2(5, 6));
		points[2].push(new THREE.Vector2(4, 7));
		points[2].push(new THREE.Vector2(3, 7.5));
		points[2].push(new THREE.Vector2(1, 8));
		points[2].push(new THREE.Vector2(0.5, 8));
		points[2].push(new THREE.Vector2(0, 7));

		points[3].push(new THREE.Vector2(0, 0));
		points[3].push(new THREE.Vector2(2, 0.5));
		points[3].push(new THREE.Vector2(5, 2));
		points[3].push(new THREE.Vector2(5, 3));
		points[3].push(new THREE.Vector2(6, 4));
		points[3].push(new THREE.Vector2(6, 5));
		points[3].push(new THREE.Vector2(5, 6));
		points[3].push(new THREE.Vector2(5, 7));
		points[3].push(new THREE.Vector2(4, 7.5));
		points[3].push(new THREE.Vector2(2, 8));
		points[3].push(new THREE.Vector2(1, 8));
		points[3].push(new THREE.Vector2(0, 7));

		points[4].push(new THREE.Vector2(0, 0));
		points[4].push(new THREE.Vector2(2, 1));
		points[4].push(new THREE.Vector2(4, 2));
		points[4].push(new THREE.Vector2(1.5, 3));
		points[4].push(new THREE.Vector2(3.5, 4));
		points[4].push(new THREE.Vector2(4, 5));
		points[4].push(new THREE.Vector2(3.5, 6));
		points[4].push(new THREE.Vector2(3.5, 6));
		points[4].push(new THREE.Vector2(3.5, 6.5));
		points[4].push(new THREE.Vector2(4, 7));
		points[4].push(new THREE.Vector2(1, 8));
		points[4].push(new THREE.Vector2(0, 7));

		var geometry = new LoftLatheBufferGeometry( points , 64);

		var material = new THREE.MeshPhongMaterial( { color: 0x5533ff } );
		var mesh = new THREE.Mesh( geometry, material ) ;
		this.add( mesh );

	}
}