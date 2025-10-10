require_relative '../app'
require 'rspec'

RSpec.describe RateLimiter do
  describe '#can_proceed?' do
    it 'allows requests within the rate limit' do
      limiter = RateLimiter.new(max_requests_per_second: 2)

      expect(limiter.can_proceed?).to be true
      expect(limiter.can_proceed?).to be true
      expect(limiter.can_proceed?).to be false
    end

    it 'resets after one second' do
      limiter = RateLimiter.new(max_requests_per_second: 1)

      expect(limiter.can_proceed?).to be true
      expect(limiter.can_proceed?).to be false

      sleep(1.1)

      expect(limiter.can_proceed?).to be true
    end

    it 'allows only one request per second by default' do
      limiter = RateLimiter.new(max_requests_per_second: 1)

      expect(limiter.can_proceed?).to be true
      expect(limiter.can_proceed?).to be false
    end
  end
end
