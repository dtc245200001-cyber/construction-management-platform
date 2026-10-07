async function test() {
  try {
    const resLogin = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@system.local', password: 'admin' })
    });
    const cookie = resLogin.headers.get('set-cookie');
    
    console.log("Logged in");
    
    const resDelete = await fetch('http://localhost:3000/api/projects/17', {
      method: 'DELETE',
      headers: { 'Cookie': cookie }
    });
    
    const text = await resDelete.text();
    console.log("Status:", resDelete.status);
    console.log("Response:", text);
  } catch (err) {
    console.error("ERROR:", err);
  }
}

test();
