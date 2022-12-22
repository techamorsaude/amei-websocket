import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { ConnectedSocket } from '@nestjs/websockets/decorators';
import { Server, Socket } from 'socket.io';
import { ConsultaDto, ProfissionalDto } from './dto/ws.dto';

export const mapClientConsulta = new Map<string, ConsultaDto>();
export const mapConsultaClient = new Map<number, Set<string>>();

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  transports: ['websocket'],
})
export class WsGateway implements OnGatewayDisconnect<Socket> {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('consultaMedicoJoin')
  async consultaMedicoJoin(
    @MessageBody() data: ProfissionalDto,
    @ConnectedSocket() client: Socket,
  ): Promise<any> {
    client.join(`room-p-${data.profissional}`);
    await this.internalSendConnections(data.profissional);
  }

  @SubscribeMessage('consultaIniciar')
  async consultaIniciar(
    @MessageBody() data: ConsultaDto,
    //@ConnectedSocket() client: Socket,
  ): Promise<any> {
    const set = (mapConsultaClient[data.consulta] ??
      new Set<string>()) as Set<string>;

    console.log(set);
    set.forEach((v) => {
      this.server.to(v).emit('iniciar_consutla', { consulta: data.consulta });
    });
  }

  async internalSendConnections(profissional: number) {
    if (!profissional) return;

    const sockets = await this.server
      .in(`room-p-${profissional}`)
      .fetchSockets();

    const consultas = new Set<number>();

    sockets.forEach((s) => {
      const consulta = mapClientConsulta[s.id];
      if (consulta && !consultas.has(consulta))
        consultas.add(consulta.consulta);
    });

    this.server
      .to(`room-p-${profissional}`)
      .emit('consultas', { consultas: Array.from(consultas) });
  }

  @SubscribeMessage('consultaPacienteJoin')
  async handleEvent(
    @MessageBody() data: ConsultaDto,
    @ConnectedSocket() client: Socket,
  ): Promise<any> {
    client.join(`room-p-${data.profissional}`);
    //client.in('').fetchSockets();
    (client as any).consulta = data.consulta;
    mapClientConsulta[client.id] = data;
    const set = (mapConsultaClient[data.consulta] ??
      new Set<string>()) as Set<string>;
    if (!set.has(client.id)) set.add(client.id);
    mapConsultaClient[data.consulta] = set;
    console.log(mapClientConsulta);
    /*this.server
      .to(`room-p-${data.profissional}`)
      .emit('connected', { consulta: data.consulta });*/

    await this.internalSendConnections(data.profissional);

    return data;
  }

  handleDisconnect(client: Socket) {
    const consulta = mapClientConsulta[client.id];
    console.log('Disconnected ' + client.id, consulta);

    if (consulta) {
      delete mapClientConsulta[client.id];

      //client.to(roomId).emit('disconnected', { consulta: consulta });
      this.internalSendConnections(consulta.profissional);

      const set = (mapConsultaClient[consulta] ??
        new Set<string>()) as Set<string>;
      if (set.has(client.id)) {
        set.delete(client.id);
        if (set.size == 0) delete mapConsultaClient[consulta];
      }
    }
  }
}
