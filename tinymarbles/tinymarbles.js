import {defs, tiny} from './examples/common.js';

// Pull these names into this module's scope for convenience:
const {Vector, vec3, unsafe3, vec4, hex_color, color, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;

export class Boundary extends defs.Cube{
    constructor(translation, rotation, scale){
        super();
        this.location_matrix = translation.times(rotation).times(scale);
        this.normal_vec = this.location_matrix.times(vec4(0,1,0,0));

        //top face for intial cube
        let face = [vec4(-1, 1, 1, 1), vec4(-1, 1, -1, 1), vec4(1, 1, 1, 1), vec4(1, 1, -1, 1)];
        
        for (let i = 0; i < face.length; i++) { 
            face[i] = this.location_matrix.times(face[i]);
        }

        this.colliding_face = face;
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
            ground: new Texture("assets/ground.jpg", "LINEAR_MIPMAP_LINEAR"),
            platform: new Texture("assets/platform.png"),
            background: new Texture("assets/background.png"),

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
        const shader = new defs.Fake_Bump_Map(1);
        this.material = new Material(shader, {
            color: color(0, 0, 0, 1),
            ambient: .5, diffusivity: 1, specularity: 0.7, 
            texture: this.data.textures.marble2
        })
        //this.shapes.platform1 = new defs.Cube();
        // array of matrices representing the camera for each marble attachment
        this.marbles = Array.apply(null, Array(4)).map(function () {});
        this.boundaries = new Array();
        this.initial_camera_location = Mat4.translation(0, 0, -50);
        // this.initial_camera_location = this.marbles[0];
        let platform1 = new Boundary(Mat4.translation(0, 3.5, 0), Mat4.rotation(Math.PI / 6, 0, 0, 1), Mat4.scale(10, .5, 10));
        this.boundaries.push(platform1);
        
        let platform2 = new Boundary(Mat4.translation(-20, -5.5, 0), Mat4.rotation(Math.PI / -6, 0, 0, 1), Mat4.scale(10, .5, 10));
        this.boundaries.push(platform2);

        // TODO: more platforms here        

        console.log(this.boundaries);
    }


    make_control_panel() {
        this.live_string(box => {
            box.textContent = "Time elapsed: " + (Math.trunc(this.t * 100 / 2 * 5/4) / 100).toFixed(2) + " seconds"
        });
        // viewing buttons
        this.key_triggered_button("View entire course", ["Control", "0"], () => this.attached = () => null);
        this.key_triggered_button("Attach to player 1", ["Control", "1"], () => this.attached = () => this.marbles[0]);
        this.key_triggered_button("Attach to player 2", ["Control", "2"], () => this.attached = () => this.marbles[1]);
        this.key_triggered_button("Attach to player 3", ["Control", "3"], () => this.attached = () => this.marbles[2]);
        this.key_triggered_button("Attach to player 4", ["Control", "4"], () => this.attached = () => this.marbles[3]);
        this.new_line();
        super.make_control_panel();
    }

    random_color(length) {
        return this.material.override(hex_color(this.colors[length]));
    }



    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate additional moving bodies if there ever aren't enough:
        
        
        while (this.bodies.length < 4)
            this.bodies.push(new Body(this.data.random_shape(), this.random_color(this.bodies.length), vec3(1, 1, 1))
                .emplace(Mat4.translation(...vec3(0, 15, 0).randomized(1)),
                    vec3(0, -1, 0).randomized(2).normalized().times(3), Math.random()));
        
        // setting the matrices for the camera if it's attached to a ball
        for (let i = 0; i < this.bodies.length; i++){
            let center_matrix = Mat4.translation(this.bodies[i].center[0],this.bodies[i].center[1],this.bodies[i].center[2]);
            this.marbles[i] = center_matrix;

        }

        for (let b of this.bodies) {
            // Gravity on Earth, where 1 unit in world space = 1 meter:
            b.linear_velocity[1] += dt * -9.8;

            // b.center has [x, y, z]
            // if (Math.abs(b.center[0]) < 10 && Math.abs(b.center[2]) < 10 && b.center[1] < 0) {
            //     b.linear_velocity[1] *= -.8;
            // }

            // if (colliding(b)) {
            //     surface = colliding(b);
            //     b.linear_velocity[0] *= surface[0] * 0.8;
            //     b.linear_velocity[1] *= surface[1] * 0.8;
            //     b.linear_velocity[2] *= surface[2] * 0.8;
            // }
            
            /* -------- Collisions -------- */
            // Platform 1
            if (Math.abs(b.center[0]) < 10 && Math.abs(b.center[2]) < 10 &&
                    b.center[1] < 5 + (b.center[0] * Math.sin(Math.PI/6)) &&
                    b.center[1] > 4 + (b.center[0] * Math.sin(Math.PI/6))) {
                        
                b.linear_velocity[1] *= -.6 * Math.cos(Math.PI/6);
                b.linear_velocity[0] += b.linear_velocity[1] * -1 * Math.sin(Math.PI/6);
            }
            // Platform 2
            if (b.center[0] < 10 && b.center[0] > -30 && Math.abs(b.center[2]) < 10 &&
                    b.center[1] < -4 + ((b.center[0] + 20) * Math.sin(-1 * Math.PI/6))) {
            
                // b.center[1] = -3 + ((b.center[0] + 20) * Math.sin(-1 * Math.PI/6));
                if (b.linear_velocity[0] < 0) {
                    b.linear_velocity[1] *= -.6 * Math.cos(Math.PI/6);
                    b.linear_velocity[0] = 0;
                }
                else {
                    b.linear_velocity[1] *= -.6 * Math.cos(Math.PI/6);
                }
                // if (b.linear_velocity[0] < 0) {
                //     b.linear_velocity[0] += b.linear_velocity[1] * 2 * Math.sin(Math.PI/6);
                // }
                // else {
                //     b.linear_velocity[0] += b.linear_velocity[1] * 1 * Math.sin(Math.PI/6);
                // }
                b.linear_velocity[0] += b.linear_velocity[1] * 1 * Math.sin(Math.PI/6);
            }

            /*
            0 Vector4 [-8.91025447845459, -1.0669872760772705, 10, 1] (4)
1 Vector4 [-8.91025447845459, -1.0669872760772705, -10, 1] (4)
2 Vector4 [8.41025447845459, 8.933012962341309, 10, 1] (4)
3 Vector4 [8.41025447845459, 8.933012962341309, -10, 1] (4)
            */

            // If about to fall through floor, reverse y velocity:
            if (b.center[1] < -8 && b.linear_velocity[1] < 0)
                b.linear_velocity[1] *= -.6;
            
            
            // Move out-of-bounds marbles to the start:
            if (b.center.norm() > 50 || b.linear_velocity.norm() < 0.1) {
                b.center[0] = 0;
                b.center[1] = 15;
                b.center[2] = 0;
                b.linear_velocity[0] = 0;
                b.linear_velocity[1] = 0;
                b.linear_velocity[2] = 0;
            }
            
        }
        // this.bodies = this.bodies.filter(b => b.center.norm() < 50 && b.linear_velocity.norm() > 0);
    }

    display(context, program_state) {
        // display(): Draw everything else in the scene besides the moving bodies.
        super.display(context, program_state);
        let desired = this.initial_camera_location;
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            this.children.push(new defs.Program_State_Viewer());
            program_state.set_camera(Mat4.translation(0, 0, -50));    // Locate the camera here (inverted matrix).
        }
        if (this.attached && this.attached() != null) {
            desired = Mat4.inverse(this.attached().times(Mat4.translation(0, 0, 5)));
        } else {
            desired = this.initial_camera_location;
        }
        let target = desired.map((x,i) => Vector.from(program_state.camera_inverse[i]).mix(x, 0.1));
        program_state.set_camera(target);

        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 1, 500);
        program_state.lights = [new Light(vec4(0, -5, -10, 1), color(1, 1, 1, 1), 100000)];
        // Draw the ground:
        this.shapes.square.draw(context, program_state, Mat4.translation(0, -10, 0)
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0)).times(Mat4.scale(50, 50, 1)), this.material.override(this.data.textures.ground));
        
        this.shapes.square.draw(context, program_state, Mat4.translation(0, -22, -40)
            .times(Mat4.rotation(0, Math.PI/2, 0, 0)).times(Mat4.scale(70, 70, 1)), this.material.override({specularity:0, texture:this.data.textures.background}));
        
        for (let bound of this.boundaries) {
            bound.draw(context, program_state, bound.location_matrix, this.material.override(this.data.textures.platform))
        }
        //this.shapes.platform1.draw(context, program_state, Mat4.translation(0, 3.5, 0).times(Mat4.rotation(Math.PI / 6, 0, 0, 1)).times(Mat4.scale(10, .5, 10)), this.material.override(this.data.textures.blue));
        //this.shapes.ball.draw(context, program_state, Mat4.translation(-9, -1, 10), this.material.override(this.data.textures.blue));
        //this.shapes.platform1.draw(context, program_state, Mat4.translation(-20, -5.5, 0).times(Mat4.rotation(Math.PI / -6, 0, 0, 1)).times(Mat4.scale(10, .5, 10)), this.material.override(this.data.textures.blue));
        
    }

    show_explanation(document_element) {
        document_element.innerHTML += `<h1>Tiny Marbles</h1>`;
    }
}
