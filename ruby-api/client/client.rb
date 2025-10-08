#!/usr/bin/env ruby

require 'httparty'
require 'json'
require 'securerandom'

class TasksClient
  include HTTParty

  def initialize
    @base_url = ENV['SERVER_URL'] || 'http://ruby-server'
    @iteration = 0
    @task_ids = []
    @user_ids = ['user1', 'user2', 'user3', 'user4', 'user5']
    @tokens = {}

    self.class.base_uri @base_url
    self.class.default_timeout 10

    puts "Ruby Tasks Client"
    puts "=" * 50
    puts "Server URL: #{@base_url}"
    puts "Using multiple user IDs: #{@user_ids.join(', ')}"
    puts "=" * 50
  end

  def run
    wait_for_server

    # Login all users at startup
    login_all_users

    puts "\n✓ Server is ready! Starting traffic generation...\n"

    loop do
      @iteration += 1
      puts "\n=== Iteration #{@iteration} ==="

      begin
        # Refresh tokens if needed (before expiration)
        refresh_tokens_if_needed

        # Health check occasionally
        health_check if @iteration % 10 == 0

        # Core CRUD operations (using random user)
        list_tasks
        sleep rand(1..3)

        create_random_task
        sleep rand(1..3)

        update_random_task if @task_ids.any?
        sleep rand(1..3)

        # Time conversion API (client-initiated)
        if @iteration % 3 == 0
          convert_time
          sleep rand(1..3)
        end

        # Delete occasionally
        if @iteration % 7 == 0 && @task_ids.any?
          delete_random_task
          sleep rand(1..3)
        end

        # Random sleep between iterations
        sleep_time = rand(5..10)
        puts "  → Sleeping for #{sleep_time}s before next iteration..."
        sleep sleep_time

      rescue => e
        puts "  ✗ Error in iteration #{@iteration}: #{e.message}"
        # Try to re-login all users if auth error
        login_all_users if e.message.include?('401')
        sleep 5
      end
    end
  end

  private

  def login_all_users
    puts "\n→ Logging in all users to get JWT tokens..."
    @user_ids.each do |user_id|
      login_user(user_id)
      sleep rand(0.5..1.5)
    end
  end

  def login_user(user_id)
    puts "  → Logging in as '#{user_id}'..."

    response = self.class.post('/login',
      headers: { 'Content-Type' => 'application/json' },
      body: { username: user_id, password: 'demo123' }.to_json
    )

    if response.code == 200
      data = response.parsed_response
      @tokens[user_id] = {
        token: data['access_token'],
        expires_at: Time.now + data['expires_in'],
        scope: data['scope']
      }
      puts "    ✓ Logged in as '#{user_id}' (expires in #{data['expires_in']}s, scope: #{data['scope']})"
    else
      puts "    ✗ Login failed for '#{user_id}': #{response.code}"
      exit 1
    end
  rescue => e
    puts "    ✗ Login error for '#{user_id}': #{e.message}"
    exit 1
  end

  def refresh_tokens_if_needed
    # Refresh tokens 1 minute before expiration
    @tokens.each do |user_id, token_data|
      if Time.now >= (token_data[:expires_at] - 60)
        puts "  → Token for '#{user_id}' expiring soon, refreshing..."
        login_user(user_id)
      end
    end
  end

  def random_user
    @user_ids.sample
  end

  def auth_headers(user_id = nil)
    user_id ||= random_user
    token = @tokens[user_id][:token]
    {
      'Content-Type' => 'application/json',
      'Authorization' => "Bearer #{token}"
    }
  end

  def wait_for_server
    max_attempts = 60
    attempt = 0

    puts "\nWaiting for server to be ready..."

    loop do
      attempt += 1

      begin
        response = self.class.get('/health')
        if response.code == 200
          puts "✓ Server is ready!"
          return
        end
      rescue => e
        # Server not ready yet
      end

      if attempt >= max_attempts
        puts "✗ Server did not become ready after #{max_attempts} attempts"
        exit 1
      end

      print "."
      sleep 2
    end
  end

  def health_check
    puts "  → Health check..."
    response = self.class.get('/health')

    if response.code == 200
      puts "    ✓ Status: #{response.parsed_response['status']}"
    else
      puts "    ✗ Health check failed: #{response.code}"
    end
  rescue => e
    puts "    ✗ Health check error: #{e.message}"
  end

  def list_tasks
    puts "  → Listing tasks..."
    response = self.class.get('/tasks', headers: auth_headers)

    if response.code == 200
      tasks = response.parsed_response
      puts "    ✓ Found #{tasks.size} tasks"

      # Track task IDs for updates/deletes
      @task_ids = tasks.map { |t| t['id'] }
    else
      puts "    ✗ Failed to list tasks: #{response.code}"
    end
  rescue => e
    puts "    ✗ Error listing tasks: #{e.message}"
  end

  def create_random_task
    puts "  → Creating new task..."

    statuses = ['pending', 'in_progress', 'completed']
    priorities = [1, 2, 3]

    titles = [
      "Implement new feature",
      "Fix critical bug",
      "Update documentation",
      "Code review PR",
      "Optimize database queries",
      "Deploy to production",
      "Write unit tests",
      "Refactor legacy code"
    ]

    task = {
      title: "#{titles.sample} ##{SecureRandom.hex(3)}",
      description: "Auto-generated task from Ruby client at #{Time.now}",
      status: statuses.sample,
      priority: priorities.sample
    }

    response = self.class.post('/tasks',
      headers: auth_headers,
      body: task.to_json
    )

    if response.code == 201
      created_task = response.parsed_response
      @task_ids << created_task['id']
      puts "    ✓ Created task ID: #{created_task['id']} - #{created_task['title']}"
    else
      puts "    ✗ Failed to create task: #{response.code}"
    end
  rescue => e
    puts "    ✗ Error creating task: #{e.message}"
  end

  def update_random_task
    return if @task_ids.empty?

    task_id = @task_ids.sample
    puts "  → Updating task #{task_id}..."

    statuses = ['pending', 'in_progress', 'completed']
    priorities = [1, 2, 3]

    task = {
      title: "Updated task #{task_id} at #{Time.now.strftime('%H:%M:%S')}",
      description: "Updated by Ruby client - iteration #{@iteration}",
      status: statuses.sample,
      priority: priorities.sample
    }

    response = self.class.put("/tasks?id=#{task_id}",
      headers: auth_headers,
      body: task.to_json
    )

    if response.code == 200
      puts "    ✓ Updated task #{task_id}"
    elsif response.code == 404
      puts "    ✗ Task #{task_id} not found (already deleted?)"
      @task_ids.delete(task_id)
    else
      puts "    ✗ Failed to update task: #{response.code}"
    end
  rescue => e
    puts "    ✗ Error updating task: #{e.message}"
  end

  def delete_random_task
    return if @task_ids.empty?

    task_id = @task_ids.sample
    puts "  → Deleting task #{task_id}..."

    response = self.class.delete("/tasks?id=#{task_id}", headers: auth_headers)

    if response.code == 204
      @task_ids.delete(task_id)
      puts "    ✓ Deleted task #{task_id}"
    elsif response.code == 404
      puts "    ✗ Task #{task_id} not found (already deleted?)"
      @task_ids.delete(task_id)
    else
      puts "    ✗ Failed to delete task: #{response.code}"
    end
  rescue => e
    puts "    ✗ Error deleting task: #{e.message}"
  end

  def convert_time
    puts "  → Converting time..."

    timezones = [
      'America/New_York',
      'Europe/London',
      'Asia/Tokyo',
      'America/Los_Angeles',
      'Australia/Sydney'
    ]

    # Use recent timestamps
    epoch = Time.now.to_i - rand(0..86400 * 30)  # Last 30 days
    timezone = timezones.sample

    payload = {
      epoch: epoch,
      timezone: timezone
    }

    response = self.class.post('/api/time-convert',
      headers: auth_headers,
      body: payload.to_json
    )

    if response.code == 200
      result = response.parsed_response
      puts "    ✓ Converted #{epoch} → #{result['converted_time']} (#{timezone})"
    elsif response.code == 429
      puts "    ⚠ Rate limit hit (429) - will retry later"
    else
      puts "    ✗ Failed to convert time: #{response.code}"
    end
  rescue => e
    puts "    ✗ Error converting time: #{e.message}"
  end
end

# Run the client
if __FILE__ == $0
  client = TasksClient.new

  # Graceful shutdown
  trap('INT') do
    puts "\n\nShutting down gracefully..."
    exit 0
  end

  trap('TERM') do
    puts "\n\nReceived TERM signal, shutting down..."
    exit 0
  end

  client.run
end
