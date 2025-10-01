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
    @token = nil
    @token_expires_at = nil

    self.class.base_uri @base_url
    self.class.default_timeout 10

    puts "Ruby Tasks Client"
    puts "=" * 50
    puts "Server URL: #{@base_url}"
    puts "=" * 50
  end

  def run
    wait_for_server

    # Login to get JWT token
    login

    puts "\n✓ Server is ready! Starting traffic generation...\n"

    loop do
      @iteration += 1
      puts "\n=== Iteration #{@iteration} ==="

      begin
        # Refresh token if needed (before expiration)
        refresh_token_if_needed

        # Health check occasionally
        health_check if @iteration % 10 == 0

        # Core CRUD operations
        list_tasks
        create_random_task
        update_random_task if @task_ids.any?

        # Time conversion API
        convert_time if @iteration % 3 == 0

        # Delete occasionally
        delete_random_task if @iteration % 7 == 0 && @task_ids.any?

        # Random sleep between requests
        sleep_time = rand(2..5)
        puts "  → Sleeping for #{sleep_time}s..."
        sleep sleep_time

      rescue => e
        puts "  ✗ Error in iteration #{@iteration}: #{e.message}"
        # Try to re-login if auth error
        login if e.message.include?('401')
        sleep 5
      end
    end
  end

  private

  def login
    puts "\n→ Logging in to get JWT token..."

    response = self.class.post('/login',
      headers: { 'Content-Type' => 'application/json' },
      body: { username: 'client-user', password: 'demo123' }.to_json
    )

    if response.code == 200
      data = response.parsed_response
      @token = data['token']
      @token_expires_at = Time.now + data['expires_in']
      puts "  ✓ Logged in successfully (token expires in #{data['expires_in']}s)"
    else
      puts "  ✗ Login failed: #{response.code}"
      exit 1
    end
  rescue => e
    puts "  ✗ Login error: #{e.message}"
    exit 1
  end

  def refresh_token_if_needed
    # Refresh token 1 minute before expiration
    if @token_expires_at && Time.now >= (@token_expires_at - 60)
      puts "  → Token expiring soon, refreshing..."
      login
    end
  end

  def auth_headers
    {
      'Content-Type' => 'application/json',
      'Authorization' => "Bearer #{@token}"
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

    response = self.class.put("/tasks/#{task_id}",
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

    response = self.class.delete("/tasks/#{task_id}", headers: auth_headers)

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
