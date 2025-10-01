require 'sinatra'
require 'sinatra/json'
require 'pg'
require 'httparty'
require 'json'
require 'jwt'

# Rate limiter for external API calls
class RateLimiter
  def initialize(max_requests_per_second: 1)
    @max_requests = max_requests_per_second
    @requests = []
    @mutex = Mutex.new
  end

  def can_proceed?
    @mutex.synchronize do
      now = Time.now
      # Remove requests older than 1 second
      @requests.reject! { |time| now - time > 1 }

      if @requests.size < @max_requests
        @requests << now
        true
      else
        false
      end
    end
  end
end

# Initialize rate limiter for WorldTimeAPI
$rate_limiter = RateLimiter.new(max_requests_per_second: 1)

# JWT configuration
JWT_SECRET = ENV['JWT_SECRET'] || 'development-secret-change-me'
JWT_ALGORITHM = 'HS512'
JWT_EXPIRATION = 15 * 60 # 15 minutes in seconds

# JWT helper methods
def generate_jwt(user_id)
  payload = {
    user_id: user_id,
    exp: Time.now.to_i + JWT_EXPIRATION,
    iat: Time.now.to_i
  }
  JWT.encode(payload, JWT_SECRET, JWT_ALGORITHM)
end

def verify_jwt(token)
  JWT.decode(token, JWT_SECRET, true, { algorithm: JWT_ALGORITHM })[0]
rescue JWT::DecodeError, JWT::ExpiredSignature => e
  nil
end

# Authentication middleware
def authenticate!
  auth_header = request.env['HTTP_AUTHORIZATION']

  unless auth_header && auth_header.start_with?('Bearer ')
    halt 401, json({ error: 'Missing or invalid Authorization header' })
  end

  token = auth_header.sub('Bearer ', '')
  payload = verify_jwt(token)

  unless payload
    halt 401, json({ error: 'Invalid or expired token' })
  end

  @current_user_id = payload['user_id']
end

# Database connection
def db_connection
  @db ||= PG.connect(
    host: ENV['DB_HOST'] || 'localhost',
    port: ENV['DB_PORT'] || 5432,
    dbname: ENV['DB_NAME'] || 'tasks_db',
    user: ENV['DB_USER'] || 'postgres',
    password: ENV['DB_PASSWORD'] || 'postgres'
  )
end

# Initialize database table
def initialize_database
  conn = db_connection
  conn.exec <<-SQL
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      priority INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  SQL

  # Insert demo data if table is empty
  result = conn.exec("SELECT COUNT(*) FROM tasks")
  count = result[0]['count'].to_i

  if count == 0
    conn.exec <<-SQL
      INSERT INTO tasks (title, description, status, priority) VALUES
      ('Setup development environment', 'Install Ruby, PostgreSQL, and dependencies', 'completed', 1),
      ('Create API endpoints', 'Implement CRUD operations for tasks', 'in_progress', 2),
      ('Add external API integration', 'Integrate WorldTimeAPI for time conversion', 'pending', 3),
      ('Write tests', 'Create comprehensive test suite', 'pending', 2),
      ('Deploy to Kubernetes', 'Create k8s manifests and deploy', 'pending', 1)
    SQL
    puts "Demo tasks inserted successfully!"
  end
rescue PG::Error => e
  puts "Database error: #{e.message}"
end

# Initialize DB on startup
configure do
  set :bind, '0.0.0.0'
  set :port, 3000
  begin
    initialize_database
    puts "Connected to PostgreSQL database!"
  rescue => e
    puts "Warning: Could not initialize database: #{e.message}"
  end
end

# Health check endpoint (no auth required)
get '/health' do
  status 200
  json({ status: 'healthy', timestamp: Time.now.iso8601 })
end

# Login endpoint (no auth required)
post '/login' do
  request.body.rewind
  data = JSON.parse(request.body.read)

  username = data['username']
  password = data['password']

  # Simple demo authentication - in production, validate against DB with bcrypt
  # For demo purposes, accept any username with password "demo123"
  if username && password == 'demo123'
    token = generate_jwt(username)

    json({
      token: token,
      expires_in: JWT_EXPIRATION,
      user_id: username,
      token_type: 'Bearer'
    })
  else
    status 401
    json({ error: 'Invalid credentials' })
  end
rescue JSON::ParserError
  status 400
  json({ error: 'Invalid JSON' })
end

# Get all tasks
get '/tasks' do
  authenticate!

  conn = db_connection
  result = conn.exec('SELECT * FROM tasks ORDER BY created_at DESC')

  tasks = result.map do |row|
    {
      id: row['id'].to_i,
      title: row['title'],
      description: row['description'],
      status: row['status'],
      priority: row['priority'].to_i,
      created_at: row['created_at'],
      updated_at: row['updated_at']
    }
  end

  json tasks
rescue PG::Error => e
  status 500
  json({ error: "Database error: #{e.message}" })
end

# Get single task
get '/tasks/:id' do
  authenticate!

  conn = db_connection
  result = conn.exec_params('SELECT * FROM tasks WHERE id = $1', [params[:id]])

  if result.ntuples == 0
    status 404
    json({ error: 'Task not found' })
  else
    row = result[0]
    json({
      id: row['id'].to_i,
      title: row['title'],
      description: row['description'],
      status: row['status'],
      priority: row['priority'].to_i,
      created_at: row['created_at'],
      updated_at: row['updated_at']
    })
  end
rescue PG::Error => e
  status 500
  json({ error: "Database error: #{e.message}" })
end

# Create new task
post '/tasks' do
  authenticate!

  request.body.rewind
  data = JSON.parse(request.body.read)

  conn = db_connection
  result = conn.exec_params(
    'INSERT INTO tasks (title, description, status, priority) VALUES ($1, $2, $3, $4) RETURNING *',
    [data['title'], data['description'], data['status'] || 'pending', data['priority'] || 1]
  )

  row = result[0]
  status 201
  json({
    id: row['id'].to_i,
    title: row['title'],
    description: row['description'],
    status: row['status'],
    priority: row['priority'].to_i,
    created_at: row['created_at'],
    updated_at: row['updated_at']
  })
rescue JSON::ParserError
  status 400
  json({ error: 'Invalid JSON' })
rescue PG::Error => e
  status 500
  json({ error: "Database error: #{e.message}" })
end

# Update task
put '/tasks/:id' do
  authenticate!

  request.body.rewind
  data = JSON.parse(request.body.read)

  conn = db_connection
  result = conn.exec_params(
    'UPDATE tasks SET title = $1, description = $2, status = $3, priority = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
    [data['title'], data['description'], data['status'], data['priority'], params[:id]]
  )

  if result.ntuples == 0
    status 404
    json({ error: 'Task not found' })
  else
    row = result[0]
    json({
      id: row['id'].to_i,
      title: row['title'],
      description: row['description'],
      status: row['status'],
      priority: row['priority'].to_i,
      created_at: row['created_at'],
      updated_at: row['updated_at']
    })
  end
rescue JSON::ParserError
  status 400
  json({ error: 'Invalid JSON' })
rescue PG::Error => e
  status 500
  json({ error: "Database error: #{e.message}" })
end

# Delete task
delete '/tasks/:id' do
  authenticate!

  conn = db_connection
  result = conn.exec_params('DELETE FROM tasks WHERE id = $1 RETURNING id', [params[:id]])

  if result.ntuples == 0
    status 404
    json({ error: 'Task not found' })
  else
    status 204
  end
rescue PG::Error => e
  status 500
  json({ error: "Database error: #{e.message}" })
end

# Time conversion endpoint using WorldTimeAPI
post '/api/time-convert' do
  authenticate!

  request.body.rewind
  data = JSON.parse(request.body.read)

  epoch = data['epoch']
  timezone = data['timezone'] || 'America/New_York'

  unless epoch
    status 400
    return json({ error: 'Missing required field: epoch' })
  end

  # Check rate limit
  unless $rate_limiter.can_proceed?
    status 429
    return json({
      error: 'Rate limit exceeded. Please wait before making another request.',
      retry_after: 1
    })
  end

  begin
    # Call WorldTimeAPI
    response = HTTParty.get(
      "http://worldtimeapi.org/api/timezone/#{timezone}",
      timeout: 5
    )

    if response.code == 200
      api_data = JSON.parse(response.body)

      # Convert epoch to Time object
      converted_time = Time.at(epoch.to_i)

      json({
        original_epoch: epoch,
        timezone: timezone,
        converted_time: converted_time.iso8601,
        api_current_time: api_data['datetime'],
        api_timezone: api_data['timezone'],
        utc_offset: api_data['utc_offset']
      })
    else
      status 502
      json({ error: "External API returned status #{response.code}" })
    end
  rescue HTTParty::Error, Timeout::Error => e
    status 502
    json({ error: "Failed to reach external API: #{e.message}" })
  rescue => e
    status 500
    json({ error: "Internal error: #{e.message}" })
  end
rescue JSON::ParserError
  status 400
  json({ error: 'Invalid JSON' })
end

# Run the app
if __FILE__ == $0
  Sinatra::Application.run!
end
