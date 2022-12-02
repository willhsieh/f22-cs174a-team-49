import {defs, tiny} from './examples/common.js';

// Pull these names into this module's scope for convenience:
const {Vector, vec, vec3, unsafe3, vec4, hex_color, color, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;

//audio
var audio = new Audio('assets/audio.mp3');
audio.volume = 0.08;
audio.play();

function toggle_music(){
    return audio.paused ? audio.play() : audio.pause();
};

// importing obj files for use
export class Shape_From_File extends Shape {                                   // **Shape_From_File** is a versatile standalone Shape that imports
                                                                               // all its arrays' data from an .obj 3D model file.
    constructor(filename) {
        super("position", "normal", "texture_coord");
        // Begin downloading the mesh. Once that completes, return
        // control to our parse_into_mesh function.
        this.load_file(filename);
    }

    load_file(filename) {                             // Request the external file and wait for it to load.
        // Failure mode:  Loads an empty shape.
        return fetch(filename)
            .then(response => {
                if (response.ok) return Promise.resolve(response.text())
                else return Promise.reject(response.status)
            })
            .then(obj_file_contents => this.parse_into_mesh(obj_file_contents))
            .catch(error => {
                this.copy_onto_graphics_card(this.gl);
            })
    }

    parse_into_mesh(data) {                           // Adapted from the "webgl-obj-loader.js" library found online:
        var verts = [], vertNormals = [], textures = [], unpacked = {};

        unpacked.verts = [];
        unpacked.norms = [];
        unpacked.textures = [];
        unpacked.hashindices = {};
        unpacked.indices = [];
        unpacked.index = 0;

        var lines = data.split('\n');

        var VERTEX_RE = /^v\s/;
        var NORMAL_RE = /^vn\s/;
        var TEXTURE_RE = /^vt\s/;
        var FACE_RE = /^f\s/;
        var WHITESPACE_RE = /\s+/;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            var elements = line.split(WHITESPACE_RE);
            elements.shift();

            if (VERTEX_RE.test(line)) verts.push.apply(verts, elements);
            else if (NORMAL_RE.test(line)) vertNormals.push.apply(vertNormals, elements);
            else if (TEXTURE_RE.test(line)) textures.push.apply(textures, elements);
            else if (FACE_RE.test(line)) {
                var quad = false;
                for (var j = 0, eleLen = elements.length; j < eleLen; j++) {
                    if (j === 3 && !quad) {
                        j = 2;
                        quad = true;
                    }
                    if (elements[j] in unpacked.hashindices)
                        unpacked.indices.push(unpacked.hashindices[elements[j]]);
                    else {
                        var vertex = elements[j].split('/');

                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 0]);
                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 1]);
                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 2]);

                        if (textures.length) {
                            unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * 2 + 0]);
                            unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * 2 + 1]);
                        }

                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 0]);
                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 1]);
                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 2]);

                        unpacked.hashindices[elements[j]] = unpacked.index;
                        unpacked.indices.push(unpacked.index);
                        unpacked.index += 1;
                    }
                    if (j === 3 && quad) unpacked.indices.push(unpacked.hashindices[elements[0]]);
                }
            }
        }
        {
            const {verts, norms, textures} = unpacked;
            for (var j = 0; j < verts.length / 3; j++) {
                this.arrays.position.push(vec3(verts[3 * j], verts[3 * j + 1], verts[3 * j + 2]));
                this.arrays.normal.push(vec3(norms[3 * j], norms[3 * j + 1], norms[3 * j + 2]));
                this.arrays.texture_coord.push(vec(textures[2 * j], textures[2 * j + 1]));
            }
            this.indices = unpacked.indices;
        }
        this.normalize_positions(false);
        this.ready = true;
    }

    draw(context, program_state, model_transform, material) {               // draw(): Same as always for shapes, but cancel all
        // attempts to draw the shape before it loads:
        if (this.ready)
            super.draw(context, program_state, model_transform, material);
    }
}


export class Boundary extends defs.Cube{
    constructor(translation, rotation, scale){
        super();
        this.location_matrix = translation.times(rotation).times(scale);
        this.normal_vec = this.location_matrix.times(vec4(0,1,0,0));

        //top face for initial cube
        let face = [vec4(-1, 1, 1, 1), vec4(-1, 1, -1, 1), vec4(1, 1, 1, 1), vec4(1, 1, -1, 1)];
        
        for (let i = 0; i < face.length; i++) { 
            face[i] = this.location_matrix.times(face[i]);
        }

        this.colliding_face = face;  
        
        //ax+by+cz=d
        this.a = this.normal_vec[0];
        this.b = this.normal_vec[1];
        this.c = this.normal_vec[2];
        //console.log(a);
        //console.log(b);
        //console.log(c);


        this.d = this.a * this.colliding_face[0][0] + this.b * this.colliding_face[0][1] + this.c * this.colliding_face[0][2];
        //console.log(d);

    }

    check_collision(point) {
        let triangle1 = [[this.colliding_face[0][0], this.colliding_face[0][2]], [this.colliding_face[1][0], this.colliding_face[1][2]], [this.colliding_face[2][0], this.colliding_face[2][2]]];

        let triangle2 = [[this.colliding_face[3][0], this.colliding_face[3][2]], [this.colliding_face[1][0], this.colliding_face[1][2]], [this.colliding_face[2][0], this.colliding_face[2][2]]];

        let plane = (this.a*point[0]+this.b*point[1]+this.c*point[2])-this.d;
        //console.log(plane);
        
        if(plane >= -0.75 && plane <= 0.75){ // 0.75 is emprirically tested
            plane = true;
            //console.log("plane satisfied");
        }
        else{
            plane = false;
        }

        point = [point[0], point[2]];

        if (plane && (this.inside_triangle(triangle1, point) || this.inside_triangle(triangle2, point))) {
            return true;
        }
        return false;

    }

    area(x1, y1, x2, y2, x3, y3) {
        return Math.abs((x1*(y2-y3) + x2*(y3-y1)+ x3*(y1-y2))/2.0);
    }

    inside_triangle(triangle, point)
    {   
        let x = point[0];
        let y = point[1];
        
        let x1 = triangle[0][0];
        let y1 = triangle[0][1];

        let x2 = triangle[1][0];
        let y2 = triangle[1][1];

        let x3 = triangle[2][0];
        let y3 = triangle[2][1];


        let A = this.area (x1, y1, x2, y2, x3, y3);
        
        let A1 = this.area (x, y, x2, y2, x3, y3);

        let A2 = this.area (x1, y1, x, y, x3, y3);

        let A3 = this.area (x1, y1, x2, y2, x, y);
            
        /* Check if sum of A1, A2 and A3 is same as A */
        return (A == A1 + A2 + A3);
    }
    
    
    move(translation, rotation, scale) {
        this.location_matrix = translation.times(rotation).times(scale);
    }

//this.shapes.platform1.draw(context, program_state, Mat4.translation(-20, -5.5, 0).times(Mat4.rotation(Math.PI / -6, 0, 0, 1)).times(Mat4.scale(10, .5, 10)), this.material.override(this.data.textures.blue));
}

export class Body {
    // **Body** can store and update the properties of a 3D body that incrementally
    // moves from its previous place due to velocities.  It conforms to the
    // approach outlined in the "Fix Your Timestep!" blog post by Glenn Fiedler.
    constructor(shape, material, size) {
        // this.shape = shape;
        // this.material = material;
        // this.size = size;
        Object.assign(this,
            {shape, material, size})
    }

    // (within some margin of distance).
    static intersect_cube(p, margin = 0) {
        return p.every(value => value >= -1 - margin && value <= 1 + margin)
    }

    static intersect_sphere(p, margin = 0) {
        return p.dot(p) < 1 + margin;

    }

   

    emplace(location_matrix, linear_velocity, angular_velocity, spin_axis = vec3(0, 0, 0).randomized(1).normalized()) {                               // emplace(): assign the body's initial values, or overwrite them.
        this.center = location_matrix.times(vec4(0, 0, 0, 1)).to3();
        this.rotation = Mat4.translation(...this.center.times(-1)).times(location_matrix);
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // drawn_location gets replaced with an interpolated quantity:
        this.drawn_location = location_matrix;
        this.temp_matrix = Mat4.identity();
        return Object.assign(this, {linear_velocity, angular_velocity, spin_axis})
    }

    advance(time_amount) {
        // advance(): Perform an integration (the simplistic Forward Euler method) to
        // advance all the linear and angular velocities one time-step forward.
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // Apply the velocities scaled proportionally to real time (time_amount):
        // Linear velocity first, then angular:
        this.center = this.center.plus(this.linear_velocity.times(time_amount));
        this.rotation.pre_multiply(Mat4.rotation(time_amount * this.angular_velocity, ...this.spin_axis));
    }

    // The following are our various functions for testing a single point,
    // p, against some analytically-known geometric volume formula

    blend_rotation(alpha) {
        // blend_rotation(): Just naively do a linear blend of the rotations, which looks
        // ok sometimes but otherwise produces shear matrices, a wrong result.

        // TODO:  Replace this function with proper quaternion blending, and perhaps
        // store this.rotation in quaternion form instead for compactness.
        return this.rotation.map((x, i) => vec4(...this.previous.rotation[i]).mix(x, alpha));
    }

    blend_state(alpha) {
        // blend_state(): Compute the final matrix we'll draw using the previous two physical
        // locations the object occupied.  We'll interpolate between these two states as
        // described at the end of the "Fix Your Timestep!" blog post.
        this.drawn_location = Mat4.translation(...this.previous.center.mix(this.center, alpha))
            .times(this.blend_rotation(alpha))
            .times(Mat4.scale(...this.size));
    }

    check_if_colliding(b, collider) {
        // check_if_colliding(): Collision detection function.
        // DISCLAIMER:  The collision method shown below is not used by anyone; it's just very quick
        // to code.  Making every collision body an ellipsoid is kind of a hack, and looping
        // through a list of discrete sphere points to see if the ellipsoids intersect is *really* a
        // hack (there are perfectly good analytic expressions that can test if two ellipsoids
        // intersect without discretizing them into points).
        if (this == b)
            return false;
        // Nothing collides with itself.
        // Convert sphere b to the frame where a is a unit sphere:
        const T = this.inverse.times(b.drawn_location, this.temp_matrix);

        const {intersect_test, points, leeway} = collider;
        // For each vertex in that b, shift to the coordinate frame of
        // a_inv*b.  Check if in that coordinate frame it penetrates
        // the unit sphere at the origin.  Leave some leeway.
        return points.arrays.position.some(p =>
            intersect_test(T.times(p.to4(1)).to3(), leeway));
    }

    //static intersect_cube(p, margin = 0) {
      //  return p.every(value => value >= -1 - margin && value <= 1 + margin)
    //}
}


export class Simulation extends Scene {
    // **Simulation** manages the stepping of simulation time.  Subclass it when making
    // a Scene that is a physics demo.  This technique is careful to totally decouple
    // the simulation from the frame rate (see below).
    constructor() {
        super();
        Object.assign(this, {time_accumulator: 0, time_scale: .0016, t: 0, dt: 1 / 20, bodies: [], steps_taken: 0});
        this.colors = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++){
            this.colors[i] = Math.floor(Math.random()*(16777215- 3883845) + 3883845).toString(16);
        }

        // all obj files will be imported here
        this.imported_obj = {
            "p1": new Shape_From_File("assets/text/p1_text.obj"),
            "p2": new Shape_From_File("assets/text/p2_text.obj"),
            "p3": new Shape_From_File("assets/text/p3_text.obj"),
            "p4": new Shape_From_File("assets/text/p4_text.obj"),
            "start": new Shape_From_File("assets/text/start_text.obj"),
            "goal": new Shape_From_File("assets/text/goal_text.obj"),
            "tree_trunk": new Shape_From_File("assets/objects/tree_trunk.obj"),
            "tree_leaves": new Shape_From_File("assets/objects/tree_leaves.obj"),
            "kirby": new Shape_From_File("assets/objects/kirby.obj")
        };
        
        this.popstar = new Material(new defs.Fake_Bump_Map(1), {
            color: color(0.4, 0.4, 0.4, 1),
            ambient: .3, diffusivity: .5, specularity: .5, texture: new Texture("assets/stars.png")
        });
        

    }

    simulate(frame_time) {
        // simulate(): Carefully advance time according to Glenn Fiedler's
        // "Fix Your Timestep" blog post.
        // This line gives ourselves a way to trick the simulator into thinking
        // that the display framerate is running fast or slow:
        frame_time = this.time_scale * frame_time;

        // Avoid the spiral of death; limit the amount of time we will spend
        // computing during this timestep if display lags:
        this.time_accumulator += Math.min(frame_time, 0.1);
        // Repeatedly step the simulation until we're caught up with this frame:
        while (Math.abs(this.time_accumulator) >= this.dt) {
            // Single step of the simulation for all bodies:
            this.update_state(this.dt);
            for (let b of this.bodies)
                b.advance(this.dt);
            // Following the advice of the article, de-couple
            // our simulation time from our frame rate:
            this.t += Math.sign(frame_time) * this.dt;
            this.time_accumulator -= Math.sign(frame_time) * this.dt;
            this.steps_taken++;
        }
        // Store an interpolation factor for how close our frame fell in between
        // the two latest simulation time steps, so we can correctly blend the
        // two latest states and display the result.
        let alpha = this.time_accumulator / this.dt;
        for (let b of this.bodies) b.blend_state(alpha);
    }

    set_colors(marble) {
        this.colors[marble] = Math.floor(Math.random()*(16777215- 3883845) + 3883845).toString(16);
    }

    make_control_panel() {
        // make_control_panel(): Create the buttons for interacting with simulation time.
        
        // change individual marble colors
        this.key_triggered_button("Change p1 color", ["Alt", "1"], () => this.set_colors(0));
        this.key_triggered_button("Change p2 color", ["Alt", "2"], () => this.set_colors(1));
        this.key_triggered_button("Change p3 color", ["Alt", "3"], () => this.set_colors(2));
        this.key_triggered_button("Change p4 color", ["Alt", "4"], () => this.set_colors(3));

        this.key_triggered_button("Speed up time", ["Shift", "T"], () => this.time_scale *= 5);
        this.key_triggered_button("Slow down time", ["t"], () => this.time_scale /= 5);
        this.key_triggered_button("Pause/Play music", ["p"], () => toggle_music());
        // this.new_line();
        // this.live_string(box => {
        //     box.textContent = "Time scale: " + this.time_scale
        // });
        // this.new_line();
        // this.live_string(box => {
        //     box.textContent = "Fixed simulation time step size: " + this.dt
        // });
        // this.new_line();
        // this.live_string(box => {
        //     box.textContent = this.steps_taken + " timesteps were taken so far."
        // });
        this.new_line();
    }
1
    display(context, program_state) {
        // display(): advance the time and state of our whole simulation.
        if (program_state.animate)
            this.simulate(program_state.animation_delta_time);
        // Draw each shape at its current location:
        let i = 0;
        for (let b of this.bodies){
            b.shape.draw(context, program_state, b.drawn_location, b.material.override({color:hex_color(this.colors[i])}));
            //this.shapes.platform1.draw(context, program_state, Mat4.translation(-20, -5.5, 0).times(Mat4.rotation(Math.PI / -6, 0, 0, 1)).times(Mat4.scale(10, .5, 10)), this.material.override(this.data.textures.blue));
            let center_matrix = Mat4.translation(b.center[0], b.center[1] + 3, b.center[2])
                .times(Mat4.rotation((Math.PI) / 2, 1, 0, 0));
            if(i == 0)
                this.imported_obj.p1.draw(context, program_state, center_matrix, this.popstar);
            if(i == 1)
                this.imported_obj.p2.draw(context, program_state, center_matrix, this.popstar);
            if(i == 2)
                this.imported_obj.p3.draw(context, program_state, center_matrix, this.popstar);
            if(i == 3)
                this.imported_obj.p4.draw(context, program_state, center_matrix, this.popstar);
            i = i + 1;
        }


    }

    update_state(dt)      // update_state(): Your subclass of Simulation has to override this abstract function.
    {
        throw "Override this"
    }
}


export class Test_Data {
    // **Test_Data** pre-loads some Shapes and Textures that other Scenes can borrow.
    constructor() {
        this.textures = {
            rgb: new Texture("assets/rgb.jpg"),
            earth: new Texture("assets/earth.gif"),
            grid: new Texture("assets/grid.png"),
            stars: new Texture("assets/stars.png"),
            text: new Texture("assets/text.png"),
            red: new Texture("assets/red.png"),
            green: new Texture("assets/green.png"),
            blue: new Texture("assets/blue.png"),
            marble: new Texture("assets/marble.png"),
            marble2: new Texture("assets/marble2.jpg"),
            kirby: new Texture("assets/kirby.png"),
            kirby2: new Texture("assets/kirby2.png"),
            ground: new Texture("assets/dreamland.webp"),
            platform: new Texture("assets/bush.jpg"),
            background: new Texture("assets/kirbackground.jpeg"),
            grass: new Texture("assets/grass.jpg"),
            balloon: new Texture("assets/balloon.jpg"),
            kirby_body: new Texture("assets/Kirby_Body.png"),
            kirby_eye: new Texture("assets/kirby_eye.png"),
            glass: new Texture("assets/glass.jpg"),
            light: new Texture("assets/light.png"),

        }
        this.shapes = {
            // donut: new defs.Torus(15, 15, [[0, 2], [0, 1]]),
            // cone: new defs.Closed_Cone(4, 10, [[0, 2], [0, 1]]),
            // capped: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
            ball: new defs.Subdivision_Sphere(5),
            // cube: new defs.Cube(),
            // prism: new (defs.Capped_Cylinder.prototype.make_flat_shaded_version())(10, 10, [[0, 2], [0, 1]]),
            // gem: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(2),
            // donut2: new (defs.Torus.prototype.make_flat_shaded_version())(20, 20, [[0, 2], [0, 1]]),
        };

    }

    random_shape(shape_list = this.shapes) {
        // random_shape():  Extract a random shape from this.shapes.
        const shape_names = Object.keys(shape_list);
        return shape_list[shape_names[~~(shape_names.length * Math.random())]]
    }
}


export class TinyMarbles extends Simulation {
    // ** Inertia_Demo** demonstration: This scene lets random initial momentums
    // carry several bodies until they fall due to gravity and bounce.
    constructor() {
        super();
        this.data = new Test_Data();
        this.shapes = Object.assign({}, this.data.shapes);
        this.shapes.square = new defs.Square();
        this.shapes.cube = new defs.Cube();
        const shader = new defs.Fake_Bump_Map(1);
        this.material = new Material(shader, {
            color: color(0, 0, 0, 1),
            ambient: .5, diffusivity: 1, specularity: 0.7, 
            texture: this.data.textures.kirby
        })

        this.lightsOn = false


        this.lights = Array();

        // materials for start and goal texts
        this.start = new Material(new defs.Fake_Bump_Map(1), {
            color: hex_color("#0000ff"),
            ambient: 1, 
            texture: new Texture("assets/balloon.jpg")
        })
        this.goal = new Material(new defs.Fake_Bump_Map(1), {
            color: hex_color("#ff0000"),
            ambient: 1, 
            texture: new Texture("assets/balloon.jpg")
        })
        this.trunk = new Material(new defs.Textured_Phong(1), {
            color: hex_color("#000000"),
            ambient: 1, 
            texture: new Texture("assets/trunk.png")
        })
        this.leaves = new Material(new defs.Textured_Phong(1), {
            color: hex_color("#000000"),
            ambient: 1, 
            texture: new Texture("assets/leaves.png")
        })

        //this.shapes.platform1 = new defs.Cube();
        // array of matrices representing the camera for each marble attachment
        this.marbles = Array.apply(null, Array(4)).map(function () {});
        this.boundaries = new Array();
        this.initial_camera_location = Mat4.translation(0, -50, -160);
        // this.initial_camera_location = this.marbles[0];
        // let platform1 = new Boundary(Mat4.translation(0, 40, 0), Mat4.rotation(Math.PI / 6, 0, 0, 1), Mat4.scale(10, .5, 10));
        // this.boundaries.push(platform1);
        // let platform2 = new Boundary(Mat4.translation(-20, 30, 0), Mat4.rotation(Math.PI / -6, 0, 0, 1), Mat4.scale(10, .5, 10));
        // this.boundaries.push(platform2);
        // let platform3 = new Boundary(Mat4.translation(-5, 18, 0), Mat4.rotation(0, 0, 0, 1), Mat4.scale(5, .5, 10));
        // this.boundaries.push(platform3);
        // let platform4 = new Boundary(Mat4.translation(5, 23, 0), Mat4.rotation(Math.PI / 4, 0, 0, 1), Mat4.scale(5, .5, 10));
        // this.boundaries.push(platform4);

        // Platforms
        let p0 = new Boundary(Mat4.translation(15, 100, 0), Mat4.rotation(Math.PI / 6, 0, 0, 1), Mat4.scale(10, .5, 10));
        this.boundaries.push(p0);

        let p1 = new Boundary(Mat4.translation(-15, 90, 0), Mat4.rotation(0, 0, 0, 1), Mat4.scale(10, .5, 10));
        this.boundaries.push(p1);

        let p2 = new Boundary(Mat4.translation(-25, 95, 0), Mat4.rotation(Math.PI / 2, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p2);

        let p3 = new Boundary(Mat4.translation(-2, 87, 0), Mat4.rotation(-Math.PI / 6, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p3);

        let p6 = new Boundary(Mat4.translation(-25, 75, 0), Mat4.rotation(-Math.PI / 3, 0, 0, 1), Mat4.scale(10, .5, 10));
        this.boundaries.push(p6);

        let p7 = new Boundary(Mat4.translation(-15, 65, 0), Mat4.rotation(-Math.PI / 6, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p7);

        let p8 = new Boundary(Mat4.translation(25, 75, 0), Mat4.rotation(Math.PI / 3, 0, 0, 1), Mat4.scale(10, .5, 10));
        this.boundaries.push(p8);

        let p9 = new Boundary(Mat4.translation(15, 65, 0), Mat4.rotation(Math.PI / 6, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p9);

        let p10 = new Boundary(Mat4.translation(-17, 50, 0), Mat4.rotation(-Math.PI / 4, 0, 0, 1), Mat4.scale(10, .5, 10));
        this.boundaries.push(p10);

        let p11 = new Boundary(Mat4.translation(-4, 55, 0), Mat4.rotation(Math.PI / 4, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p11);
        
        let p12 = new Boundary(Mat4.translation(4, 55, 0), Mat4.rotation(-Math.PI / 4, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p12);

        let p13 = new Boundary(Mat4.translation(18, 45, 0), Mat4.rotation(Math.PI / 6, 0, 0, 1), Mat4.scale(10, .5, 10));
        this.boundaries.push(p13);

        let p14 = new Boundary(Mat4.translation(-15, 35, 0), Mat4.rotation(-Math.PI / 6, 0, 0, 1), Mat4.scale(7, .5, 10));
        this.boundaries.push(p14);

        let p17 = new Boundary(Mat4.translation(15, 25, 0), Mat4.rotation(-Math.PI / 4, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p17);

        let p18 = new Boundary(Mat4.translation(25, 28, 0), Mat4.rotation(Math.PI / 4, 0, 0, 1), Mat4.scale(10, .5, 10));
        this.boundaries.push(p18);

        let p19 = new Boundary(Mat4.translation(-5, 25, 0), Mat4.rotation(Math.PI / 6, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p19);

        let p20 = new Boundary(Mat4.translation(2, 23, 0), Mat4.rotation(-Math.PI / 3, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p20);

        let p21 = new Boundary(Mat4.translation(-18, 20, 0), Mat4.rotation(-Math.PI / 6, 0, 0, 1), Mat4.scale(8, .5, 10));
        this.boundaries.push(p21);

        let p22 = new Boundary(Mat4.translation(8, 15, 0), Mat4.rotation(-Math.PI / 6, 0, 0, 1), Mat4.scale(5, .5, 10));
        this.boundaries.push(p22);

        let p23 = new Boundary(Mat4.translation(20, 5, 0), Mat4.rotation(Math.PI / 6, 0, 0, 1), Mat4.scale(15, .5, 10));
        this.boundaries.push(p23);

        let p26 = new Boundary(Mat4.translation(-20, 5, 0), Mat4.rotation(-Math.PI / 6, 0, 0, 1), Mat4.scale(15, .5, 10));
        this.boundaries.push(p26);

        console.log(this.boundaries);
    }

    toggle_lights(){
        this.lightsOn = !this.lightsOn;
    }

    make_control_panel() {
        this.live_string(box => {
            box.textContent = "Time elapsed: " + (Math.trunc(this.t * 100 / 2 * 5/4) / 100).toFixed(2) + " seconds"
        });
        // viewing buttons
        this.new_line();
        this.key_triggered_button("View entire course", ["Control", "0"], () => this.attached = () => null);
        this.key_triggered_button("Attach to player 1", ["Control", "1"], () => this.attached = () => this.marbles[0]);
        this.key_triggered_button("Attach to player 2", ["Control", "2"], () => this.attached = () => this.marbles[1]);
        this.key_triggered_button("Attach to player 3", ["Control", "3"], () => this.attached = () => this.marbles[2]);
        this.key_triggered_button("Attach to player 4", ["Control", "4"], () => this.attached = () => this.marbles[3]);
        this.new_line();
        this.key_triggered_button("Toggle Lights", ["l"], () => this.toggle_lights());
        super.make_control_panel();
    }

    random_color(length) {
        return this.material.override(hex_color(this.colors[length]));
    }

    update_velocity(b, restitution=0.7, normal) {
        if (normal[0] < 0) {
            if (b.linear_velocity[0] > 0) {
                b.linear_velocity[0] = 0;
            }
            if (b.linear_velocity[1] < 0) {
                b.linear_velocity[1] *= normal[1] * 2 * -restitution;
            }
            b.linear_velocity[0] += b.linear_velocity[1] * normal[0] * 2;
        }
        else if (normal[0] > 0) {
            if (b.linear_velocity[0] < 0) {
                b.linear_velocity[0] = 0;
            }
            if (b.linear_velocity[1] < 0) {
                b.linear_velocity[1] *= normal[1] * 2 * -restitution;
            }
            b.linear_velocity[0] += b.linear_velocity[1] * normal[0] * 2;
        }
        else if (b.linear_velocity[1] < 0) {
            b.linear_velocity[1] *= -restitution;
        }
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate additional moving bodies if there ever aren't enough:
        
        while (this.bodies.length < 4)
            this.bodies.push(new Body(this.data.random_shape(), this.random_color(this.bodies.length), vec3(1, 1, 1))
                .emplace(Mat4.translation(...vec3(15, 120, 0).randomized(1)),
                    vec3(-0.5, 0, 0).randomized(0).normalized().times(3), Math.random()));
        
        // setting the matrices for the camera if it's attached to a ball
        for (let i = 0; i < this.bodies.length; i++){
            let center_matrix = Mat4.translation(this.bodies[i].center[0],this.bodies[i].center[1],this.bodies[i].center[2]);
            this.marbles[i] = center_matrix;

        }

        // COLLISIONS AND PHYSICS UPDATES
        for (let b of this.bodies) {
            let idx = 0;
            for (let p of this.boundaries) {
                if (p.check_collision(b.center)) {
                    // console.log(idx);
                    this.update_velocity(b, 0.8, p.normal_vec);
                }
                idx += 1;
            }
        }

        for (let b of this.bodies) {
            // Gravity on Earth, where 1 unit in world space = 1 meter:
            b.linear_velocity[1] += dt * -9.8;

            /*
            0 Vector4 [-8.91025447845459, -1.0669872760772705, 10, 1] (4)
1 Vector4 [-8.91025447845459, -1.0669872760772705, -10, 1] (4)
2 Vector4 [8.41025447845459, 8.933012962341309, 10, 1] (4)
3 Vector4 [8.41025447845459, 8.933012962341309, -10, 1] (4)
            */

            // If about to fall through floor, reverse y velocity:
            if (b.center[1] < -8 && b.linear_velocity[1] < 0)
                b.linear_velocity[1] *= -.6;
            
            // Left-right borders:
            if (Math.abs(b.center[0]) > 24) {
                b.linear_velocity[0] *= -1;
            }

            // Front-back borders:
            if (Math.abs(b.center[2]) > 10) {
                b.linear_velocity[2] *= -1;
            }
            
            
            // Move out-of-bounds marbles to the start:
            if (b.center.norm() > 150 || b.linear_velocity.norm() < 0.3) {
                b.center[0] = 15;
                b.center[1] = 120;
                b.center[2] = 0;
                b.linear_velocity[0] = Math.random() - 0.5;
                b.linear_velocity[1] = 0;
                b.linear_velocity[2] = Math.random() * 2 - 1;
            }
            
        }
        // this.bodies = this.bodies.filter(b => b.center.norm() < 50 && b.linear_velocity.norm() > 0);
    }

    display(context, program_state) {
        // display(): Draw everything else in the scene besides the moving bodies.
        super.display(context, program_state);

        // camera locations, varies if the camera is attached to the marbles
        let desired = this.initial_camera_location;
        // if (!context.scratchpad.controls) {
        //     this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
        //     this.children.push(new defs.Program_State_Viewer());
        //     program_state.set_camera(this.initial_camera_location);    // Locate the camera here (inverted matrix).
        // }
        if (this.attached && this.attached() != null) {
            desired = Mat4.inverse(this.attached().times(Mat4.translation(0, 0, 10)));
        } else {
            desired = this.initial_camera_location;
        }
        let target = desired.map((x,i) => Vector.from(program_state.camera_inverse[i]).mix(x, 0.1));
        program_state.set_camera(target);

        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 1, 500);
        if (this.lightsOn){
            program_state.lights = [new Light(vec4(0, 50, -10, 1), color(1, 1, 1, 1), 1000)]
        }
        else{
            program_state.lights = [new Light(vec4(50, 50, -10, 1), color(1, 1, 1, 1), 1000)]
        }
        
        this.shapes.square.draw(context, program_state, Mat4.translation(0, 35, 0).times(Mat4.scale(2,2,1)).times(Mat4.rotation(0, Math.PI/3, 0, 0)), this.material.override({ambient:0.8, specularity:1, diffusivity:1, texture:this.data.textures.light}));

        // Draw the ground:
        this.shapes.ball.draw(context, program_state, Mat4.translation(0, -52, -20)
            .times(Mat4.scale(130, 40, 1)), this.material.override({ambient:0.9, specularity:0,texture:this.data.textures.grass}));

        this.shapes.square.draw(context, program_state, Mat4.translation(0, 57, -20)
            .times(Mat4.rotation(0, Math.PI/2, 0, 0)).times(Mat4.scale(140, 100, 1)), this.material.override({ambient:0.8, specularity:0, texture:this.data.textures.background}));
        

        for (let i = 0; i < this.boundaries.length; i++) {
            let bound = this.boundaries[i]
            if (i == 5|| i == 4||i > 8 && i < 15){
                bound.draw(context, program_state, bound.location_matrix, this.material.override({ambient: 0.8,texture: this.data.textures.glass}));
            }
            bound.draw(context, program_state, bound.location_matrix, this.material.override({color: hex_color("4CBB17"),texture: this.data.textures.platform}));
        }
        //this.shapes.platform1.draw(context, program_state, Mat4.translation(0, 3.5, 0).times(Mat4.rotation(Math.PI / 6, 0, 0, 1)).times(Mat4.scale(10, .5, 10)), this.material.override(this.data.textures.blue));
        //this.shapes.ball.draw(context, program_state, Mat4.translation(-9, -1, 10), this.material.override(this.data.textures.blue));
        //this.shapes.platform1.draw(context, program_state, Mat4.translation(-20, -5.5, 0).times(Mat4.rotation(Math.PI / -6, 0, 0, 1)).times(Mat4.scale(10, .5, 10)), this.material.override(this.data.textures.blue));
        
        // draw start and goal texts
        let model_transform = Mat4.identity().times(Mat4.translation(10, 110, 0))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(3, 3, 3));
        this.imported_obj.start.draw(context, program_state, model_transform, this.start);
        
        // trees
        model_transform = Mat4.identity().times(Mat4.translation(-50, -3, 0)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 12, 0, 1, 0));
        this.imported_obj.tree_trunk.draw(context, program_state, model_transform, this.trunk);
        model_transform = Mat4.identity().times(Mat4.translation(-50, 0, 0)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 12, 0, 1, 0));
        this.imported_obj.tree_leaves.draw(context, program_state, model_transform, this.leaves);
        
        model_transform = Mat4.identity().times(Mat4.translation(-35, 2, 10)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 4, 0, 1, 0));
        this.imported_obj.tree_trunk.draw(context, program_state, model_transform, this.trunk);
        model_transform = Mat4.identity().times(Mat4.translation(-35, 5, 10)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 4, 0, 1, 0));
        this.imported_obj.tree_leaves.draw(context, program_state, model_transform, this.leaves);

        model_transform = Mat4.identity().times(Mat4.translation(-70, -3, 15)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 32, 0, 1, 0));
        this.imported_obj.tree_trunk.draw(context, program_state, model_transform, this.trunk);
        model_transform = Mat4.identity().times(Mat4.translation(-70, 0, 15)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 32, 0, 1, 0));
        this.imported_obj.tree_leaves.draw(context, program_state, model_transform, this.leaves);

        model_transform = Mat4.identity().times(Mat4.translation(40, -4, -5)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 16, 0, 1, 0));
        this.imported_obj.tree_trunk.draw(context, program_state, model_transform, this.trunk);
        model_transform = Mat4.identity().times(Mat4.translation(40, -1, -5)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 16, 0, 1, 0));
        this.imported_obj.tree_leaves.draw(context, program_state, model_transform, this.leaves);

        model_transform = Mat4.identity().times(Mat4.translation(65, -3, 10)).times(Mat4.scale(5,5,5));
        this.imported_obj.tree_trunk.draw(context, program_state, model_transform, this.trunk);
        model_transform = Mat4.identity().times(Mat4.translation(65, 0, 10)).times(Mat4.scale(5,5,5));
        this.imported_obj.tree_leaves.draw(context, program_state, model_transform, this.leaves);

        model_transform = Mat4.identity().times(Mat4.translation(80, -9, 0)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 4, 0, 1, 0));
        this.imported_obj.tree_trunk.draw(context, program_state, model_transform, this.trunk);
        model_transform = Mat4.identity().times(Mat4.translation(80, -6, 0)).times(Mat4.scale(5,5,5)).times(Mat4.rotation(Math.PI / 4, 0, 1, 0));
        this.imported_obj.tree_leaves.draw(context, program_state, model_transform, this.leaves);

        model_transform = Mat4.identity().times(Mat4.translation(0, 0, 0))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            .times(Mat4.scale(3, 3, 3));
        this.imported_obj.goal.draw(context, program_state, model_transform, this.goal);

    }

    show_explanation(document_element) {
        document_element.innerHTML += `<h1>Tiny Marbles</h1>`;
    }
}
