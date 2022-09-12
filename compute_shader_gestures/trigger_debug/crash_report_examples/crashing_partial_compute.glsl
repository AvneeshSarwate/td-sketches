// Example Compute Shader

// uniform float exampleUniform;

uniform vec3 launchPosition;
uniform float triggered;
uniform float launchPosition;
uniform vec2 evt_time_map[100];

layout (local_size_x = 32, local_size_y = 32) in;


#define POS_AND_SCALE 0
#define COLOR 1
#define VELOCITY 2
#define LIFE 7


struct Particle{
    vec3 position;
    float active;
    float age;
    float evtInd;
    float evtType;
};

void Spawn(inout Particle p){
    float u = Random().x;
    vec2 lookup = vec2(u, 0.5);
    p.position = texture(sTD2DInputs[EMIT_TRANSFORM], lookup).xyz;
    p.velocity = texture(sTD2DInputs[EMIT_NORMAL], lookup).xyz;
    p.acceleration = vec3(0);
    p.life = max(0, uLifeExpectancy.x - (uLifeExpectancy.y * Random().x));
    p.scale = uScaleAndScaleVariance.x + uScaleAndScaleVariance.y * Random().x;
}

void Evolve(inout Particle p){

}

bool Active(){
    return Index() < uParticleCount;
}

bool StartSpawn() {

}

Particle Read(){
    Particle p;
    p.acceleration = vec3(0);
    vec4 posAndActive = imageLoad(mTDComputeOutputs[0], ivec2(gl_GlobalInvocationID.xy));
    p.position = posAndActive.xyz;
    p.active = posAndActive.w;
    vec4 metaData = imageLoad(mTDComputeOutputs[1], ivec2(gl_GlobalInvocationID.xy));
    p.age = metaData.x;
    p.evtInd = metaData.y;
    p.evtType = metaData.z;
    return p;
}

void Write(Particle p){
    imageStore(mTDComputeOutputs[0], ivec2(gl_GlobalInvocationID.xy), TDOutputSwizzle(vec4(p.position, p.active)));
    vec4 metaData = vec4(p.age, p.evtInd, p.evtType, 1);
    imageStore(mTDComputeOutputs[1], ivec2(gl_GlobalInvocationID.xy), TDOutputSwizzle(metaData));
}

void main_default()
{
    vec4 color;
    //color = texelFetch(sTD2DInputs[0], ivec2(gl_GlobalInvocationID.xy), 0);
    color = vec4(1.0);
    imageStore(mTDComputeOutputs[0], ivec2(gl_GlobalInvocationID.xy), TDOutputSwizzle(color));
}

void main()
{
    //read particle
    Particle p = Read(); //use invocation IDs
    if(StartSpawn) {
        p = Spawn();
    }
    if(Active()){
        Evolve(p);
    } 

    Write(p); //use invocation IDs
}
