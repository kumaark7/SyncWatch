package xyz.projectdarkhope.syncwatch.room;

import org.springframework.stereotype.Service;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomStore {
    private static final String CHARS="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final SecureRandom random=new SecureRandom();
    private final ConcurrentHashMap<String,Room> rooms=new ConcurrentHashMap<>();

    public Room create(String roomName){
        String id;
        do{id=newId();}while(rooms.containsKey(id));
        Room room=new Room(id,roomName);rooms.put(id,room);return room;
    }

    public Optional<Room> find(String id){
        if(id==null)return Optional.empty();
        return Optional.ofNullable(rooms.get(id.trim().toUpperCase()));
    }

    public Collection<Room> all(){return rooms.values();}

    private String newId(){
        StringBuilder s=new StringBuilder();
        for(int i=0;i<6;i++)s.append(CHARS.charAt(random.nextInt(CHARS.length())));
        return s.toString();
    }
}
