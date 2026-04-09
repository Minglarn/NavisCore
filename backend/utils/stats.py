from ais_logic import get_ship_type_name

class StatsCollector:
    def __init__(self):
        self.previous_hourly_snapshot = None
        self.reset_hourly()
        self.daily_new_vessels = 0
        
    def reset_hourly(self):
        # Spara föregående timmens snapshot innan vi nollställer
        if hasattr(self, 'hourly_messages'):
            self.previous_hourly_snapshot = self.get_hourly_snapshot()
        self.hourly_messages = 0
        self.hourly_new_vessels = 0
        self.hourly_mmsis = set()
        self.hourly_max_range = 0.0
        self.hourly_shiptypes = {} # type_id -> set(mmsis)
        
    def update_range(self, dist_km):
        if dist_km > self.hourly_max_range:
            self.hourly_max_range = dist_km
        
    def update(self, mmsi, is_new, shiptype_id):
        self.hourly_messages += 1
        if is_new:
            self.hourly_new_vessels += 1
            self.daily_new_vessels += 1
        self.hourly_mmsis.add(mmsi)
        if shiptype_id:
            try:
                sid = int(shiptype_id)
                if sid not in self.hourly_shiptypes:
                    self.hourly_shiptypes[sid] = set()
                self.hourly_shiptypes[sid].add(mmsi)
            except: pass

    def get_hourly_snapshot(self):
        shiptype_dist = {}
        for i in range(100):
            label = get_ship_type_name(i)
            if label not in shiptype_dist:
                shiptype_dist[label] = 0
                
        for sid, mmsis in self.hourly_shiptypes.items():
            try:
                label = get_ship_type_name(sid)
                shiptype_dist[label] += len(mmsis)
            except: pass
            
        return {
            "messages_received": self.hourly_messages,
            "new_vessels": self.hourly_new_vessels,
            "max_vessels": len(self.hourly_mmsis),
            "max_range_km": round(self.hourly_max_range, 2),
            "max_range_nm": round(self.hourly_max_range * 0.539957, 2),
            "shiptypes": shiptype_dist
        }

# Global instans
stats_collector = StatsCollector()
